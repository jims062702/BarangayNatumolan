<?php

namespace App\Http\Controllers\Api;

use App\Models\ChatConversation;
use App\Models\Notification;
use App\Models\User;
use App\Support\ChatShortcuts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Live-agent chat.
 *
 * The chatbot answers what it can. When it cannot — or the person simply asks
 * for a human — the conversation is handed to the BARANGAY SECRETARY, who
 * staffs the live desk. Everything here is plain polling over the existing
 * REST API: no websocket server to keep alive, which matters for a barangay
 * office running this on a single machine.
 *
 * The public half is deliberately unauthenticated: most people who need help
 * are on the landing page without an account. Their conversation is addressed
 * by an unguessable session token, and that token is the only thing that
 * opens it.
 */
class ChatController extends BaseController
{
    /** Roles that staff the live desk. */
    private const AGENT_ROLES = ['Secretary', 'Punong Barangay', 'Admin'];

    /*
    |--------------------------------------------------------------------------
    | Visitor side (public)
    |--------------------------------------------------------------------------
    */

    /**
     * Opens a conversation with the live desk.
     *
     * Registered residents only, and signed in. The desk is one Secretary
     * answering one person at a time, and an anonymous form on a public page
     * is an invitation to fill that queue with people the barangay has no way
     * to identify, reach afterwards, or hold to anything. Signing in also
     * means the name, email and number are already on the record — so the
     * form that used to ask for them is gone.
     */
    public function start(Request $request)
    {
        $resident = $this->callerResidentId();

        if (!$resident) {
            return $this->forbidden(
                'The live desk is for registered residents. Sign in to your portal account '
                    . 'and the Secretary will see who they are talking to.'
            );
        }

        $validated = $request->validate([
            'topic' => 'nullable|string|max:120',
            'message' => 'required|string|max:2000',
        ]);

        /*
         * One open conversation per resident. Pressing "talk to a human"
         * twice must not put the same person in the queue twice, ahead of
         * everybody who only pressed it once.
         */
        $existing = ChatConversation::where('resident_id', $resident)
            ->whereIn('status', ['Waiting', 'Active'])
            ->latest('id')
            ->first();

        if ($existing) {
            $existing->addMessage('visitor', $validated['message']);

            if ($existing->status === 'Waiting') {
                $this->notifyDesk($existing, $validated['message']);
            }

            return $this->success([
                'session_token' => $existing->session_token,
                'conversation' => $this->visitorView($existing->fresh()),
            ], 'You already have a conversation open — your message was added to it.');
        }

        $conversation = ChatConversation::create([
            'session_token' => ChatConversation::newSessionToken(),
            'resident_id' => $resident,
            'topic' => $validated['topic'] ?? null,
            'status' => 'Waiting',
        ]);

        $conversation->addMessage(
            'system',
            'Conversation started. Waiting for the Barangay Secretary to join.'
        );
        $conversation->addMessage('visitor', $validated['message']);

        $this->notifyDesk($conversation, $validated['message']);

        return $this->success([
            'session_token' => $conversation->session_token,
            'conversation' => $this->visitorView($conversation->fresh()),
        ], 'You are in the queue — the Barangay Secretary will be with you shortly', 201);
    }

    /**
     * The resident's own conversation, without needing the token.
     *
     * The token lives in one browser's storage. Signing in on a phone after
     * starting on a laptop, or simply clearing site data, used to lose the
     * thread — and with it whatever the Secretary had already answered. The
     * account is the durable handle now; the token is just the message key.
     */
    public function mine()
    {
        $resident = $this->callerResidentId();

        if (!$resident) {
            return $this->forbidden('The live desk is for registered residents.');
        }

        $conversation = ChatConversation::where('resident_id', $resident)
            ->whereIn('status', ['Waiting', 'Active'])
            ->latest('id')
            ->first();

        /*
         * Closed conversations are not open, but they are not gone either —
         * see `history`. The count travels even when there is nothing open,
         * so the widget can offer them without a second request.
         */
        $past = ChatConversation::where('resident_id', $resident)
            ->where('status', 'Closed')
            ->count();

        if (!$conversation) {
            return $this->success(
                ['conversation' => null, 'past_conversations' => $past],
                'No conversation open'
            );
        }

        $conversation->forceFill(['unread_for_visitor' => 0])->save();

        return $this->success([
            'session_token' => $conversation->session_token,
            'conversation' => $this->visitorView($conversation),
            'past_conversations' => $past,
            'messages' => $conversation->messages()->get()->map(fn ($m) => $this->messageView($m)),
        ], 'Conversation retrieved');
    }

    /**
     * Every conversation this resident has had, newest first.
     *
     * Resolving one does not delete anything — `close` writes a system line
     * and flips the status — but `mine` only ever returned an OPEN one, so
     * the moment the Secretary marked a conversation resolved it vanished
     * from the resident's side. The answer they had been given went with it.
     *
     * That is the wrong way round. The resident is the one who has to act on
     * what was said: which office, which day, what to bring. The desk can
     * look a thread up again whenever it likes; the resident could not.
     *
     * Only the outline here. The thread itself is read through `thread`,
     * which already serves a closed conversation to the resident who owns it.
     */
    public function history()
    {
        $resident = $this->callerResidentId();

        if (!$resident) {
            return $this->forbidden('The live desk is for registered residents.');
        }

        $rows = ChatConversation::where('resident_id', $resident)
            ->withCount('messages')
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(function (ChatConversation $conversation) {
                /*
                 * The resident's own first line, as the label. A list of
                 * dates says nothing about which conversation was which —
                 * "my clearance" is what they are looking for.
                 */
                $opening = $conversation->messages()
                    ->where('sender', 'visitor')
                    ->orderBy('id')
                    ->value('body');

                return [
                    'session_token' => $conversation->session_token,
                    'status' => $conversation->status,
                    'started_at' => $conversation->created_at?->toDateTimeString(),
                    'closed_at' => $conversation->closed_at?->toDateTimeString(),
                    'agent_name' => $conversation->agent?->name,
                    'messages' => $conversation->messages_count,
                    'opening' => $opening ? Str::limit(trim($opening), 80) : null,
                ];
            });

        return $this->success(['conversations' => $rows], 'Conversation history retrieved');
    }

    /** The resident behind the request, or null for anybody else. */
    private function callerResidentId(): ?int
    {
        return auth('sanctum')->user()?->resident_id;
    }

    /** The visitor's own view of the thread, newest last. */
    public function thread(string $token)
    {
        $conversation = $this->ownedConversation($token);

        if (!$conversation) {
            return $this->notFound('That conversation could not be found');
        }

        // Reading the thread is what clears the visitor's unread badge.
        $conversation->forceFill(['unread_for_visitor' => 0])->save();

        return $this->success([
            'conversation' => $this->visitorView($conversation),
            'messages' => $conversation->messages()->get()->map(fn ($m) => $this->messageView($m)),
        ], 'Conversation retrieved');
    }

    public function sendMessage(Request $request, string $token)
    {
        $validated = $request->validate([
            'body' => 'required|string|max:2000',
        ]);

        $conversation = $this->ownedConversation($token);

        if (!$conversation) {
            return $this->notFound('That conversation could not be found');
        }

        if ($conversation->status === 'Closed') {
            return $this->error('This conversation has been closed. Start a new one if you still need help.', 409);
        }

        $message = $conversation->addMessage('visitor', $validated['body']);

        // Only ring the desk again when nobody has picked this up yet — an
        // agent already in the conversation sees it in their open thread.
        if ($conversation->status === 'Waiting') {
            $this->notifyDesk($conversation, $validated['body']);
        }

        return $this->success($this->messageView($message), 'Message sent', 201);
    }

    /**
     * One more question, on a conversation the desk had finished with.
     *
     * A new conversation was the only way to ask this, and it arrived at the
     * desk with no history: the agent could not see what had already been
     * answered, and the resident had to explain it twice. This reopens the
     * thread instead, so the answer and the follow-up sit together.
     *
     * It goes back to Waiting rather than to the agent who closed it. That
     * agent may be off duty, and a follow-up sitting in one person's queue
     * until they next log in is slower than the new conversation it replaces.
     */
    public function followUp(Request $request, string $token)
    {
        $validated = $request->validate([
            'body' => 'required|string|max:2000',
        ]);

        $conversation = $this->ownedConversation($token);

        if (!$conversation) {
            return $this->notFound('That conversation could not be found');
        }

        /*
         * Only a closed one is reopened. An open conversation taking this
         * route would silently reset its status and count a follow-up that
         * never happened, so it is sent down the ordinary path instead.
         */
        if ($conversation->status !== 'Closed') {
            return $this->sendMessage($request, $token);
        }

        /*
         * `closed_at` is kept, not cleared.
         *
         * The agent reading this needs to know whether the thread went quiet
         * for an hour or for a month — it changes how much of it they have to
         * read back — and `closed_at` is overwritten the next time it closes.
         */
        $conversation->update([
            'status' => 'Waiting',
            'follow_up_count' => $conversation->follow_up_count + 1,
            'reopened_at' => now(),
            'last_closed_at' => $conversation->closed_at,
            'closed_at' => null,
        ]);

        /* A line in the thread itself, so the gap is visible while reading. */
        $conversation->addMessage(
            'system',
            $conversation->last_closed_at
                ? 'The resident followed up on this conversation, closed '
                    . $conversation->last_closed_at->diffForHumans() . '.'
                : 'The resident followed up on this conversation.'
        );

        $message = $conversation->addMessage('visitor', $validated['body']);

        $this->notifyDesk($conversation, $validated['body'], followUp: true);

        return $this->success([
            'conversation' => $this->visitorView($conversation->fresh()),
            'message' => $this->messageView($message),
        ], 'Follow-up sent', 201);
    }

    /** Lets the visitor end the conversation from their side. */
    public function endConversation(string $token)
    {
        $conversation = $this->ownedConversation($token);

        if (!$conversation) {
            return $this->notFound('That conversation could not be found');
        }

        if ($conversation->status !== 'Closed') {
            $conversation->addMessage('system', 'The visitor ended the conversation.');
            $conversation->update(['status' => 'Closed', 'closed_at' => now()]);
        }

        return $this->success(null, 'Conversation closed');
    }

    /*
    |--------------------------------------------------------------------------
    | Agent side (Secretary)
    |--------------------------------------------------------------------------
    */

    /** The live desk worklist: waiting first, then whatever is still open. */
    /**
     * The canned answers the desk can drop into a reply.
     *
     * Read from the same service guides and roster the public website
     * uses, so a correction made once is a correction everywhere — and
     * the Secretary never retypes a requirement from memory.
     */
    public function shortcuts(): JsonResponse
    {
        return $this->success(ChatShortcuts::all(), 'Shortcuts retrieved');
    }

    public function conversations(Request $request)
    {
        $query = ChatConversation::with('resident:id,first_name,middle_name,last_name,suffix,zone_purok', 'agent:id,name');

        $status = $request->input('status', 'open');

        if ($status === 'open') {
            $query->whereIn('status', ['Waiting', 'Active']);
        } elseif (in_array($status, ['Waiting', 'Active', 'Closed'], true)) {
            $query->where('status', $status);
        }

        $conversations = $query
            /*
             * Waiting before Active, then oldest ARRIVAL first — the same
             * order the resident is shown as their queue number. Ranking on
             * the last message instead would move somebody down the list for
             * sending a follow-up, and then the number they were quoted would
             * be a lie.
             */
            ->orderByRaw("CASE status WHEN 'Waiting' THEN 0 WHEN 'Active' THEN 1 ELSE 2 END")
            ->orderBy('created_at')
            ->paginate(20);

        $conversations->getCollection()->transform(fn ($c) => $this->agentView($c));

        return $this->success($conversations, 'Conversations retrieved');
    }

    /** How many people are waiting right now — for the sidebar badge. */
    public function waitingCount()
    {
        $mine = ChatConversation::where('assigned_to', auth()->id())
            ->where('status', 'Active')
            ->with('resident:id,first_name,last_name')
            ->first();

        return $this->success([
            'waiting' => ChatConversation::where('status', 'Waiting')->count(),
            // SUM() comes back as a string from MySQL; the badge wants a number.
            'unread' => (int) ChatConversation::whereIn('status', ['Waiting', 'Active'])
                ->sum('unread_for_agent'),
            // The one conversation this agent is in, so the desk can grey out
            // the rest instead of letting them be opened and then refused.
            'active_id' => $mine?->id,
            'active_with' => $mine?->visitor_name,
        ], 'Live chat queue');
    }

    public function showConversation(ChatConversation $conversation)
    {
        $conversation->load('resident', 'agent:id,name');

        // Opening the thread clears the agent's unread badge for it.
        $conversation->forceFill(['unread_for_agent' => 0])->save();

        return $this->success([
            'conversation' => $this->agentView($conversation),
            'messages' => $conversation->messages()->with('user:id,name,role')->get()
                ->map(fn ($m) => $this->messageView($m)),
        ], 'Conversation retrieved');
    }

    /**
     * Whoever the agent is already with, if it is not this conversation.
     *
     * The desk is one person answering one person. Two threads at once means
     * both visitors get half an answer slowly, and the queue behind them is
     * told nothing — so the register refuses rather than letting it happen.
     */
    private function agentIsBusyWith(ChatConversation $conversation): ?ChatConversation
    {
        return ChatConversation::where('assigned_to', auth()->id())
            ->where('status', 'Active')
            ->where('id', '!=', $conversation->id)
            ->with('resident:id,first_name,last_name')
            ->first();
    }

    /** Says who, and what to do about it. */
    private function busyMessage(ChatConversation $busy): string
    {
        return 'You are already in a conversation with ' . $busy->visitor_name
            . '. Close it when you are done and the next person comes through — '
            . 'the desk handles one at a time so nobody is left half-answered.';
    }

    /** The secretary takes the conversation. */
    public function claim(ChatConversation $conversation)
    {
        if ($conversation->status === 'Closed') {
            return $this->error('This conversation is already closed', 409);
        }

        if ($busy = $this->agentIsBusyWith($conversation)) {
            return $this->error($this->busyMessage($busy), 409);
        }

        if ($conversation->assigned_to && $conversation->assigned_to !== auth()->id()) {
            return $this->error(
                'This conversation is already being handled by ' . ($conversation->agent?->name ?? 'another staff member') . '.',
                409
            );
        }

        $conversation->update([
            'status' => 'Active',
            'assigned_to' => auth()->id(),
            'claimed_at' => $conversation->claimed_at ?? now(),
        ]);

        $conversation->addMessage(
            'system',
            auth()->user()->name . ' (' . auth()->user()->role . ') has joined the conversation.'
        );

        return $this->success($this->agentView($conversation->fresh()), 'You are now handling this conversation');
    }

    public function reply(Request $request, ChatConversation $conversation)
    {
        $validated = $request->validate([
            'body' => 'required|string|max:2000',
        ]);

        if ($conversation->status === 'Closed') {
            return $this->error('This conversation is closed', 409);
        }

        // Replying IS taking the conversation — an agent should never have to
        // press "claim" before they can help someone. It is still one at a
        // time: replying into a second thread would open it just as surely as
        // claiming it would.
        if (!$conversation->assigned_to) {
            if ($busy = $this->agentIsBusyWith($conversation)) {
                return $this->error($this->busyMessage($busy), 409);
            }

            $conversation->update([
                'status' => 'Active',
                'assigned_to' => auth()->id(),
                'claimed_at' => now(),
            ]);
        }

        $message = $conversation->addMessage('agent', $validated['body'], auth()->id());
        $conversation->forceFill(['unread_for_agent' => 0])->save();

        // A resident with a portal account also gets it in their notifications,
        // so an answer that lands after they close the tab is not lost.
        if ($conversation->resident_id) {
            Notification::notifyResident(
                $conversation->resident_id,
                'chat_reply',
                'Reply from the Barangay Secretary',
                $validated['body'],
                'chat',
                $conversation->id
            );
        }

        return $this->success($this->messageView($message->load('user:id,name,role')), 'Reply sent', 201);
    }

    public function close(Request $request, ChatConversation $conversation)
    {
        if ($conversation->status === 'Closed') {
            return $this->success($this->agentView($conversation), 'Conversation already closed');
        }

        $conversation->addMessage(
            'system',
            'The Barangay Secretary marked this conversation as resolved.'
        );
        $conversation->update(['status' => 'Closed', 'closed_at' => now()]);

        return $this->success($this->agentView($conversation->fresh()), 'Conversation closed');
    }

    /*
    |--------------------------------------------------------------------------
    | Shared
    |--------------------------------------------------------------------------
    */

    private function bySessionToken(string $token): ?ChatConversation
    {
        return ChatConversation::where('session_token', $token)->first();
    }

    /**
     * The conversation behind a token, but only for the resident it belongs
     * to.
     *
     * The token used to be the whole key, which was right when a stranger on
     * the landing page had nothing else. Now that the desk is residents only,
     * a leaked or guessed token must not be enough to read somebody's chat
     * with the barangay — those threads carry complaints and family business.
     */
    private function ownedConversation(string $token): ?ChatConversation
    {
        $conversation = $this->bySessionToken($token);
        $resident = $this->callerResidentId();

        return $conversation && $resident && $conversation->resident_id === $resident
            ? $conversation
            : null;
    }

    /** Rings every account that staffs the live desk. */
    private function notifyDesk(
        ChatConversation $conversation,
        string $preview,
        bool $followUp = false,
    ): void {
        $ids = User::where('is_active', true)
            ->whereIn('role', self::AGENT_ROLES)
            ->pluck('id');

        /*
         * A follow-up says so in the title. Read as a fresh enquiry it looks
         * like a resident who has not been helped yet, and the desk answers a
         * question it has already answered.
         */
        $title = $followUp
            ? 'Live chat follow-up: ' . $conversation->visitor_name
            : 'Live chat: ' . $conversation->visitor_name . ' needs help';

        Notification::notifyUsers(
            $ids,
            'chat_waiting',
            $title,
            \Illuminate\Support\Str::limit($preview, 140),
            'chat',
            $conversation->id
        );
    }

    /** What the visitor may see: never the internal ids of staff accounts. */
    private function visitorView(ChatConversation $conversation): array
    {
        return [
            'status' => $conversation->status,
            'agent_name' => $conversation->agent?->name,
            'agent_role' => $conversation->agent?->role,
            'unread' => $conversation->unread_for_visitor,
            'last_message_at' => $conversation->last_message_at,
            'closed_at' => $conversation->closed_at,
            /* So the widget knows to offer "ask a follow-up" rather than a
               disabled box, and can say it has been reopened before. */
            'follow_up_count' => $conversation->follow_up_count,
        ] + $this->queueView($conversation);
    }

    /**
     * Where this person stands in the line.
     *
     * One Secretary answers one person at a time, so anybody who is not first
     * is waiting behind somebody — and a wait with no number attached feels
     * like being ignored. Telling them they are third is the difference
     * between waiting and wondering whether the thing is broken at all.
     *
     * Ordered by ARRIVAL, never by last message: ranking on the latest
     * message would send a person to the back of the queue for asking whether
     * anyone is there.
     */
    private function queueView(ChatConversation $conversation): array
    {
        if ($conversation->status !== 'Waiting') {
            return ['queue_position' => null, 'queue_total' => 0];
        }

        $waiting = ChatConversation::where('status', 'Waiting');

        return [
            'queue_position' => (clone $waiting)
                ->where('created_at', '<=', $conversation->created_at)
                ->where('id', '<=', $conversation->id)
                ->count(),
            'queue_total' => $waiting->count(),
        ];
    }

    private function agentView(ChatConversation $conversation): array
    {
        return [
            'id' => $conversation->id,
            'visitor_name' => $conversation->visitor_name,
            'is_resident' => (bool) $conversation->resident_id,
            'resident_id' => $conversation->resident_id,
            'guest_email' => $conversation->guest_email,
            'guest_contact' => $conversation->guest_contact,
            'topic' => $conversation->topic,
            'status' => $conversation->status,
            'assigned_to' => $conversation->assigned_to,
            'agent_name' => $conversation->agent?->name,
            'unread' => $conversation->unread_for_agent,
            'last_message_at' => $conversation->last_message_at,
            'created_at' => $conversation->created_at,
            'closed_at' => $conversation->closed_at,

            /*
             * That this is a resident coming back, and how often.
             *
             * Once is somebody who forgot to ask something. Four times is a
             * matter the desk keeps closing without settling, and the count
             * is the only place that shows.
             */
            'follow_up_count' => $conversation->follow_up_count,
            'reopened_at' => $conversation->reopened_at,
            'last_closed_at' => $conversation->last_closed_at,
        ];
    }

    private function messageView($message): array
    {
        return [
            'id' => $message->id,
            'sender' => $message->sender,
            // Staff messages are signed, so the resident knows who answered.
            'sender_name' => $message->sender === 'agent'
                ? ($message->user?->name ?? 'Barangay Secretary')
                : null,
            'body' => $message->body,
            'created_at' => $message->created_at,
        ];
    }
}
