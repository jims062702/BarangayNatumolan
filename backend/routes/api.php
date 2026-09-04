<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AdministrativeRecordController;
use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BlotterController;
use App\Http\Controllers\Api\CertificateController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\HeroSlideController;
use App\Http\Controllers\Api\LuponController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\OfficialController;
use App\Http\Controllers\Api\PopulationController;
use App\Http\Controllers\Api\PortalController;
use App\Http\Controllers\Api\PublicController;
use App\Http\Controllers\Api\RbimCensusController;
use App\Http\Controllers\Api\ResidentTransferController;
use App\Http\Controllers\Api\QueueController;
use App\Http\Controllers\Api\ReferralController;
use App\Http\Controllers\Api\ResidentController;
use App\Http\Controllers\Api\ServiceGuideController;
use App\Http\Controllers\Api\ServiceRequestController;
use App\Http\Controllers\Api\VawcController;

/*
|--------------------------------------------------------------------------
| Public — no authentication
|--------------------------------------------------------------------------
| Accounts are BPO/Admin-created; there is intentionally NO public register.
*/
Route::post('auth/login', [AuthController::class, 'login']);
/*
| First sign-in for a resident portal account. The account is created for
| them when they are registered, so it stays inert until they enter the code
| emailed to the address on their record. Both endpoints re-check the
| password, so neither reveals whether an address exists.
*/
Route::post('auth/activate', [AuthController::class, 'activate'])->middleware('throttle:10,1');
Route::post('auth/resend-activation', [AuthController::class, 'resendActivationCode'])->middleware('throttle:3,1');

Route::get('services', [ServiceRequestController::class, 'getAvailableServices']);
Route::get('contact', [ServiceRequestController::class, 'getContactInfo']);
Route::get('announcements', [PublicController::class, 'announcements']);
Route::get('announcements/{announcement}', [PublicController::class, 'announcement']);
Route::get('hero-slides', [PublicController::class, 'heroSlides']);
Route::get('officials', [PublicController::class, 'officials']);
Route::get('stats', [PublicController::class, 'stats']);
Route::get('verify/{referenceNumber}', [PublicController::class, 'verifyCertificate']);
Route::post('assistant/inquiry', [PublicController::class, 'assistantInquiry']);

/*
| Live-agent chat — REGISTERED RESIDENTS, signed in.
|
| It was open to anyone, on the reasoning that whoever most needs a human is
| on the landing page without an account. In practice one Secretary answers
| one person at a time, and an anonymous form in front of that queue fills it
| with people the barangay cannot identify, cannot reach afterwards, and
| cannot hold to anything. Signing in also means the name, email and number
| are already on the record, so nobody is asked to type them again.
|
| The chatbot on the same widget stays open to everyone; it is the handoff to
| a person that needs an account.
*/
Route::middleware('auth:sanctum')->group(function () {
    Route::post('chat/start', [ChatController::class, 'start'])->middleware('throttle:10,1');
    // Resumes the resident's own thread without the browser-stored token,
    // so a chat started on a laptop is there on their phone.
    Route::get('chat/mine', [ChatController::class, 'mine']);
    /*
    | The token pattern is pinned to the 48 random characters the server
    | issues. Without it `chat/{token}` is declared first and would swallow
    | the staff desk's own `chat/conversations`, matching it as a token.
    */
    Route::get('chat/{token}', [ChatController::class, 'thread'])->where('token', '[A-Za-z0-9]{48}');
    Route::post('chat/{token}/messages', [ChatController::class, 'sendMessage'])
        ->where('token', '[A-Za-z0-9]{48}')->middleware('throttle:60,1');
    Route::post('chat/{token}/end', [ChatController::class, 'endConversation'])
        ->where('token', '[A-Za-z0-9]{48}');
});
Route::post('contact', [PublicController::class, 'contact'])->middleware('throttle:5,1');

/*
|--------------------------------------------------------------------------
| Authenticated
|--------------------------------------------------------------------------
*/
Route::middleware('auth:sanctum')->group(function () {

    // Account endpoints (staff + residents)
    Route::prefix('auth')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
        Route::put('profile', [AuthController::class, 'updateProfile']);
        Route::post('change-password', [AuthController::class, 'changePassword']);
        Route::post('refresh-token', [AuthController::class, 'refreshToken']);
    });

    // In-system notifications (staff + residents, self-scoped)
    Route::get('notifications', [NotificationController::class, 'index']);
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('notifications/{notification}/read', [NotificationController::class, 'markRead']);

    /*
    |----------------------------------------------------------------------
    | Resident portal (role Resident, linked resident record required)
    |----------------------------------------------------------------------
    */
    /*
     * Sidebar counts, for STAFF AND RESIDENTS alike.
     *
     * This sat inside the staff group, so a resident asking for it got a 403
     * — which the sidebar swallows, leaving no badges and no error. The
     * resident half of badges() had been written and was unreachable. The
     * method gates on role and office itself, which is where that decision
     * belongs.
     */
    Route::get('dashboard/badges', [DashboardController::class, 'badges']);

    Route::prefix('portal')->middleware('office:ResidentRole')->group(function () {
        Route::get('dashboard', [PortalController::class, 'dashboard']);
        Route::get('requests', [PortalController::class, 'myRequests']);
        Route::post('requests', [PortalController::class, 'createRequest']);
        Route::get('requests/{serviceRequest}', [PortalController::class, 'showRequest']);
        Route::get('appointments', [PortalController::class, 'myAppointments']);
        Route::post('appointments', [PortalController::class, 'bookAppointment']);
        Route::post('appointments/{appointment}/cancel', [PortalController::class, 'cancelAppointment']);
        Route::get('certificates', [PortalController::class, 'myCertificates']);
        // What a certificate needs and costs, so the request form can say so.
        Route::get('certificate-services', [PortalController::class, 'certificateServices']);
        Route::get('profile', [PortalController::class, 'profile']);
        // Parents, lola/lolo, spouse, children and siblings, read-only.
        Route::get('family', [PortalController::class, 'family']);
        /*
        | Their own KP cases and blotter entries. NOT VAWC — see the
        | method: the existence of such a case is itself confidential,
        | and the portal is opened on devices the survivor may share
        | with the person they are escaping.
        */
        Route::get('cases', [PortalController::class, 'cases']);
    });

    /*
    |----------------------------------------------------------------------
    | Staff-only area (any office role; residents blocked)
    |----------------------------------------------------------------------
    */
    Route::middleware('staff')->group(function () {

        // Dashboards & notifications (all staff, incl. clerk)
        Route::get('dashboard/summary', [DashboardController::class, 'getSummary']);
        Route::get('dashboard/pending-items', [DashboardController::class, 'getPendingItems']);
        /*
        | The numbers beside the sidebar items. Open to every staff account
        | because it answers only for the caller's OWN office — the method
        | gates each figure the same way the menu and the routes do.
        */

        // Punong Barangay executive view — the whole-barangay picture.
        Route::get('dashboard/executive', [DashboardController::class, 'getExecutiveSummary'])
            ->middleware('office:PB,AdminRole');

        /*
        | Name lookup stays open to every office: VAWC, Health and the Lupon
        | all need the resident picker to attach a person to their own record.
        | It returns identity fields only — never the browsable registry.
        */
        Route::get('residents/search', [ResidentController::class, 'search']);
        Route::get('residents/household-options', [ResidentController::class, 'householdOptions']);

        /*
        | Resident registry proper — the Population Office (BPO) alone. They
        | are the only office that registers a person, so they are the only
        | one that browses, edits or classifies the registry. Every other
        | office attaches a resident through `residents/search` above.
        */
        Route::middleware('office:Population,AdminRole')->group(function () {
            /*
            | Family tree. `family/{relation}` REGISTERS a new person and
            | links them in one step (the Add parent / Add child / Add spouse
            | buttons); `family/link` connects two people who are both already
            | on the register. Declared before the apiResource so
            | `residents/{resident}/family/...` is never swallowed by it.
            */
            /*
            | Duplicate repair. Declared with the family routes because that is
            | what a split record breaks first: half the family on one copy,
            | half on the other.
            */
            Route::get('residents/{resident}/duplicates', [ResidentController::class, 'duplicates']);
            Route::post('residents/{resident}/merge', [ResidentController::class, 'merge']);
            // Merging is a judgement call, so it has to be reversible.
            Route::get('residents/{resident}/merges', [ResidentController::class, 'merges']);
            Route::post('residents/{resident}/merges/{merge}/undo', [ResidentController::class, 'unmerge']);

            /*
            | Marriage is a HISTORY: ending one records why, frees both to
            | marry again, and keeps the old row so an older certificate
            | naming a different spouse still makes sense.
            */
            /*
            | Living or deceased. Not the same as deactivating a record:
            | the family links stay, the portal login goes, and a marriage
            | ends as widowed.
            */
            Route::post('residents/{resident}/life-status', [ResidentController::class, 'updateLifeStatus']);

            // A relative who lived elsewhere has moved in: convert rather
            // than re-register, so their family links come with them.
            Route::post('residents/{resident}/convert-to-resident', [ResidentController::class, 'convertToResident']);

            Route::get('residents/{resident}/marriages', [ResidentController::class, 'marriages']);
            Route::post('residents/{resident}/marriages/{marriage}/end', [ResidentController::class, 'endMarriage']);
            Route::post('residents/{resident}/marriages/{marriage}/visibility', [ResidentController::class, 'marriageVisibility']);

            /*
            | Guardianship: who is raising a child when the parents are not.
            | Recorded on the family routes because that is where the gap
            | shows — a child registered here whose mother and father are both
            | on the register as living somewhere else.
            */
            Route::post('residents/{resident}/guardianships/{guardianship}/end', [ResidentController::class, 'endGuardianship']);

            Route::get('residents/{resident}/family', [ResidentController::class, 'family']);
            Route::post('residents/{resident}/family/link', [ResidentController::class, 'linkRelative']);
            Route::post('residents/{resident}/family/{relation}', [ResidentController::class, 'addRelative'])
                ->whereIn('relation', ['parent', 'child', 'spouse', 'guardian']);
            Route::delete('residents/{resident}/family/{relative}', [ResidentController::class, 'unlinkRelative']);

            /*
            | A whole household in one submission — the shape a house-to-house
            | visit actually produces. Declared BEFORE the apiResource so
            | `residents/household` is not swallowed as `residents/{id}`.
            */
            Route::post('residents/household', [ResidentController::class, 'storeHousehold']);

            Route::apiResource('residents', ResidentController::class);
            Route::post('residents/{resident}/sectors', [ResidentController::class, 'addSector']);
            Route::delete('residents/{resident}/sectors/{sector}', [ResidentController::class, 'removeSector']);
        });

        /*
        | Counter verification — "is this person registered, and have they been
        | issued a portal account?" The front desk runs this before filing a
        | certificate, so it sits OUTSIDE the registry group: it answers a
        | yes/no about one person instead of opening the register.
        */
        Route::get('population/verify-resident', [PopulationController::class, 'verifyResident'])
            ->middleware('office:Main Office,Population,AdminRole');

        /*
        | Certificates & clearances. Three presses, all the clerk's: accept,
        | print, release. The Punong Barangay signs the paper on its way to
        | the counter, which is a thing that happens at a desk rather than a
        | route here. Nothing on this line is a decision about the request.
        */
        Route::middleware('office:Main Office,PB,AdminRole')->group(function () {
            Route::get('certificates/fee-schedule', [CertificateController::class, 'feeSchedule']);
            Route::get('certificates/requirements', [CertificateController::class, 'requirements']);
            Route::apiResource('certificates', CertificateController::class)
                ->only(['index', 'store', 'show', 'update']);
            Route::post('certificates/{certificate}/accept', [CertificateController::class, 'accept']);
            Route::post('certificates/{certificate}/mark-printed', [CertificateController::class, 'markPrinted']);
            Route::post('certificates/{certificate}/release', [CertificateController::class, 'release']);
            Route::post('certificates/{certificate}/cancel', [CertificateController::class, 'cancel']);
            Route::post('certificates/{certificate}/reprint', [CertificateController::class, 'reprint']);
        });

        /*
        | Live-agent chat desk. The SECRETARY is responsible for it, with the
        | Punong Barangay and Admin able to step in; the Clerk is excluded,
        | since their remit is the service counter.
        */
        Route::prefix('chat')->middleware(['office:Main Office,PB,AdminRole', 'deny_role:Clerk'])->group(function () {
            // The canned answers the composer offers behind @certificate/… and
            // @officials/…, built from the guides and roster the office keeps.
            Route::get('shortcuts', [ChatController::class, 'shortcuts']);
            Route::get('queue/count', [ChatController::class, 'waitingCount']);
            Route::get('conversations', [ChatController::class, 'conversations']);
            Route::get('conversations/{conversation}', [ChatController::class, 'showConversation']);
            Route::post('conversations/{conversation}/claim', [ChatController::class, 'claim']);
            Route::post('conversations/{conversation}/reply', [ChatController::class, 'reply']);
            Route::post('conversations/{conversation}/close', [ChatController::class, 'close']);
        });

        /*
        | The blotter — the desk's record of what was reported.
        |
        | Main Office and the PB. NOT the other desks: an incident book
        | the whole hall can read is the reason VAWC keeps its own.
        */
        Route::middleware('office:Main Office,PB,AdminRole')->group(function () {
            Route::get('blotters', [BlotterController::class, 'index']);
            Route::post('blotters', [BlotterController::class, 'store']);
            Route::get('blotters/{blotter}', [BlotterController::class, 'show']);
            Route::put('blotters/{blotter}', [BlotterController::class, 'update']);
        });

        /*
        | Front desk — request intake and the window queue. Main Office only
        | (Clerk and Secretary), plus the PB. The Lupon works its own docket
        | and its own hearing calendar, not the service counter.
        */
        Route::middleware('office:Main Office,PB,AdminRole')->group(function () {
            Route::apiResource('service-requests', ServiceRequestController::class);
            Route::get('service-requests/{serviceRequest}/status', [ServiceRequestController::class, 'getStatus']);

            Route::get('queue', [QueueController::class, 'index']);
            Route::post('queue', [QueueController::class, 'store']);
            Route::post('queue/{queue}/call', [QueueController::class, 'call']);
            Route::post('queue/{queue}/serve', [QueueController::class, 'serve']);
            Route::post('queue/{queue}/complete', [QueueController::class, 'complete']);
            Route::post('queue/{queue}/absent', [QueueController::class, 'absent']);
            Route::delete('queue/{queue}', [QueueController::class, 'destroy']);
        });

        /*
        | Everything below is off-limits to the Clerk (requests & certificates only).
        */
        Route::middleware('deny_role:Clerk')->group(function () {
            /*
            | Cross-office coordination and aggregated reporting — Main Office
            | and the Punong Barangay.
            |
            | Every other desk coordinates and reports inside its own module:
            | the VAWC Desk keeps a separate referral trail behind its own
            | gate, the Health Station records referrals on the visit /
            | maternal / child forms, the Lupon routes through the CFA, and
            | the Population Office has its own sectoral analytics. The
            | statistics here measure service requests, referrals and
            | administrative records — none of which those offices own.
            */
            Route::middleware('office:Main Office,PB,AdminRole')->group(function () {
                Route::get('reports/service-statistics', [DashboardController::class, 'getServiceStatistics']);
                Route::get('referrals/statistics', [ReferralController::class, 'statistics']);
                Route::apiResource('referrals', ReferralController::class)
                    ->only(['index', 'store', 'show', 'update', 'destroy']);
            });

            // Barangay administrative records (ordinances, resolutions, …)
            Route::prefix('administrative-records')->middleware('office:Main Office,PB,AdminRole')->group(function () {
                Route::get('statistics', [AdministrativeRecordController::class, 'statistics']);
                // Adoption is the Punong Barangay's act, not the secretary's.
                Route::post('{administrativeRecord}/approve', [AdministrativeRecordController::class, 'approve'])
                    ->middleware('office:PB,AdminRole');
                Route::post('{administrativeRecord}/archive', [AdministrativeRecordController::class, 'archive']);
            });
            Route::apiResource('administrative-records', AdministrativeRecordController::class)
                ->only(['index', 'store', 'show', 'update', 'destroy'])
                ->middleware('office:Main Office,PB,AdminRole');

            // Appointments — booked at the front desk, so the same office
            // that runs intake (plus the PB, who is scheduled into them).
            Route::middleware('office:Main Office,PB,AdminRole')->group(function () {
                Route::apiResource('appointments', AppointmentController::class);
                Route::post('appointments/{appointment}/confirm', [AppointmentController::class, 'confirm']);
                Route::post('appointments/{appointment}/cancel', [AppointmentController::class, 'cancel']);
            });

            // AI service-guide knowledge base (Main Office / PB / Admin)
            Route::prefix('manage')->middleware('office:Main Office,PB,AdminRole')->group(function () {
                Route::apiResource('service-guides', ServiceGuideController::class)
                    ->only(['index', 'store', 'update', 'destroy']);
            });
        });

        /*
        | Sangguniang Kabataan (SK) — manages the public landing content:
        | home pictures, news & announcements, and officials.
        */
        Route::prefix('sk')->middleware('office:SK,PB,AdminRole')->group(function () {
            Route::post('hero-slides/reorder', [HeroSlideController::class, 'reorder']);
            Route::apiResource('hero-slides', HeroSlideController::class)
                ->only(['index', 'store', 'update', 'destroy']);
            Route::apiResource('officials', OfficialController::class)
                ->only(['index', 'store', 'update', 'destroy']);
            Route::post('announcements/reorder', [AnnouncementController::class, 'reorder']);
            Route::apiResource('announcements', AnnouncementController::class)
                ->only(['index', 'store', 'update', 'destroy']);
        });

        /*
        | VAWC Desk — STRICTLY isolated: office VAWC only.
        */
        Route::prefix('vawc')->middleware('office:VAWC')->group(function () {
            // Desk-wide worklists (case codes only — never survivor names).
            Route::get('referrals', [VawcController::class, 'deskReferrals']);
            Route::put('referrals/{referral}', [VawcController::class, 'updateDeskReferral']);
            Route::get('followups', [VawcController::class, 'deskFollowups']);
            Route::get('documents', [VawcController::class, 'deskDocuments']);
            Route::put('documents/{document}', [VawcController::class, 'updateDocument']);
            Route::get('access-logs', [VawcController::class, 'deskAccessLogs']);

            Route::get('cases', [VawcController::class, 'index']);
            Route::post('cases', [VawcController::class, 'store']);
            Route::get('cases/{case}', [VawcController::class, 'show']);
            Route::put('cases/{case}', [VawcController::class, 'update']);
            Route::post('cases/{case}/incidents', [VawcController::class, 'addIncident']);
            Route::post('cases/{case}/referrals', [VawcController::class, 'createReferral']);
            Route::put('cases/{case}/referrals/{referral}', [VawcController::class, 'updateReferral']);
            Route::post('cases/{case}/followup', [VawcController::class, 'recordFollowup']);
            Route::get('cases/{case}/documents', [VawcController::class, 'getDocuments']);
            Route::post('cases/{case}/documents', [VawcController::class, 'addDocument']);
            Route::get('cases/{case}/access-logs', [VawcController::class, 'accessLogs']);
            Route::get('reports/statistics', [VawcController::class, 'getStatistics']);
        });

        /*
        | Lupon Tagapamayapa — Lupon office + Punong Barangay.
        */
        Route::prefix('lupon')->middleware('office:Lupon,PB')->group(function () {
            Route::get('deadlines', [LuponController::class, 'deadlines']);
            Route::get('reports/monthly-transmittal', [LuponController::class, 'generateMonthlyReport']);

            // Desk-wide worklists: the hearing calendar and the compliance
            // register, both spanning the whole docket.
            Route::get('hearings', [LuponController::class, 'deskHearings']);
            Route::put('hearings/{hearing}', [LuponController::class, 'updateHearing']);
            Route::post('hearings/{hearing}/summons', [LuponController::class, 'recordSummons']);
            Route::post('hearings/{hearing}/reschedule', [LuponController::class, 'rescheduleHearing']);
            Route::get('settlements', [LuponController::class, 'deskSettlements']);
            Route::post('settlements/{settlement}/action', [LuponController::class, 'deskSettlementAction']);
            Route::get('cases', [LuponController::class, 'index']);
            Route::post('cases', [LuponController::class, 'store']);
            Route::get('cases/{case}', [LuponController::class, 'show']);
            Route::post('cases/{case}/screen-jurisdiction', [LuponController::class, 'screenJurisdiction']);
            Route::post('cases/{case}/hearings', [LuponController::class, 'scheduleHearing']);
            Route::put('cases/{case}/hearings/{hearing}', [LuponController::class, 'recordHearingOutcome']);
            Route::post('cases/{case}/mediation', [LuponController::class, 'recordMediation']);
            Route::post('cases/{case}/conciliation', [LuponController::class, 'recordConciliation']);
            Route::post('cases/{case}/settlement', [LuponController::class, 'recordSettlement']);
            Route::post('cases/{case}/settlement-action', [LuponController::class, 'settlementAction']);
            Route::get('cases/{case}/forms', [LuponController::class, 'generateForms']);
        });

        /*
        | Population Office (BPO) — owns the registry & portal accounts.
        */
        /*
         | RBIM baseline census — the DILG household form.
         |
         | Collected by the BHW (Health Station) and encoded, then reviewed
         | by the Population Office. The office gate is wider than the rest
         | of the population module for exactly that reason; the controller
         | narrows reconciliation to the BPO itself.
         */
        /*
         | Getting the register in and out as a spreadsheet.
         |
         | Preview before import, always: the office is handing the system a
         | file from somewhere else, and the preview is the only chance
         | anybody gets to look before four hundred records change.
         */
        Route::get('residents-export', [ResidentTransferController::class, 'export']);
        Route::get('residents-import/template', [ResidentTransferController::class, 'template']);
        Route::post('residents-import/preview', [ResidentTransferController::class, 'preview']);
        Route::post('residents-import', [ResidentTransferController::class, 'import']);

        Route::get('rbim/code-lists', [RbimCensusController::class, 'codeLists']);
        // Is this house already on the register, and who is in it?
        Route::get('rbim/verify-household', [RbimCensusController::class, 'verifyHousehold']);
        // Is this address free to be somebody's login?
        Route::get('rbim/check-email', [RbimCensusController::class, 'checkEmail']);
        Route::get('rbim', [RbimCensusController::class, 'index']);
        Route::post('rbim', [RbimCensusController::class, 'store']);
        Route::get('rbim/{rbimCensus}', [RbimCensusController::class, 'show']);
        Route::put('rbim/{rbimCensus}', [RbimCensusController::class, 'update']);
        // Submitting is what registers the household — see the controller.
        Route::post('rbim/{rbimCensus}/submit', [RbimCensusController::class, 'submit']);
        Route::put('rbim/{rbimCensus}/members/{member}', [RbimCensusController::class, 'matchMember']);
        Route::delete('rbim/{rbimCensus}', [RbimCensusController::class, 'destroy']);

        Route::prefix('population')->middleware('office:Population,AdminRole')->group(function () {
            Route::get('households', [PopulationController::class, 'listHouseholds']);
            Route::post('households', [PopulationController::class, 'createHousehold']);
            Route::put('households/{household}', [PopulationController::class, 'updateHousehold']);
            Route::put('households/{household}/head', [PopulationController::class, 'setHouseholdHead']);
            // Who owned it before, and why it changed hands.
            Route::get('households/{household}/owner-history', [PopulationController::class, 'householdOwnerHistory']);
            Route::get('events', [PopulationController::class, 'listEvents']);
            Route::post('events', [PopulationController::class, 'recordPopulationEvent']);
            Route::put('events/{event}/verify', [PopulationController::class, 'verifyEvent']);
            Route::get('sectors/{sector}', [PopulationController::class, 'getSectorList']);
            Route::get('analytics', [PopulationController::class, 'getAnalytics']);
            Route::get('reports/sectoral', [PopulationController::class, 'getSectoralReport']);
            Route::post('residents/{resident}/create-account', [PopulationController::class, 'createResidentAccount']);
            Route::post('residents/{resident}/change-password', [PopulationController::class, 'changeResidentPassword']);
            Route::get('accounts', [PopulationController::class, 'listResidentAccounts']);
            Route::post('accounts/{user}/toggle', [PopulationController::class, 'toggleResidentAccount']);
            // "I never got the email" — sends a fresh activation code.
            Route::post('accounts/{user}/resend-activation', [PopulationController::class, 'resendActivation']);
        });

        /*
        | Barangay Health Station — health personnel only.
        */
        Route::prefix('health')->middleware('office:Health Station')->group(function () {
            Route::get('visits', [HealthController::class, 'listVisits']);
            Route::post('visits', [HealthController::class, 'createVisit']);
            Route::get('patients/{resident}/history', [HealthController::class, 'getPatientHistory']);
            Route::get('immunization', [HealthController::class, 'listImmunizations']);
            Route::post('immunization', [HealthController::class, 'recordImmunization']);
            Route::get('immunization-status/{resident}', [HealthController::class, 'getImmunizationStatus']);
            Route::get('maternal-health', [HealthController::class, 'listMaternal']);
            Route::post('maternal-health', [HealthController::class, 'recordMaternalHealth']);
            Route::get('child-health', [HealthController::class, 'listChildHealth']);
            Route::post('child-health', [HealthController::class, 'recordChildHealth']);
            Route::get('reports/coverage', [HealthController::class, 'getCoverageReport']);
        });

        /*
        | System Administration — staff account management (Admin only)
        */
        Route::prefix('admin')->middleware('office:AdminRole')->group(function () {
            Route::get('users', [AdminUserController::class, 'index']);
            Route::post('users', [AdminUserController::class, 'store']);
            Route::put('users/{user}', [AdminUserController::class, 'update']);
        });
    });
});
