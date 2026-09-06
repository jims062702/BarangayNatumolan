<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A barangay does not post "news". It posts five different things, and a
 * resident wants them for five different reasons.
 *
 *   Announcement  something you need to know      "Office hours on the 15th"
 *   Event         something you can still join    "Assembly, August 15"
 *   Activity      something already done          "Road clearing conducted"
 *   Advisory      something urgent                "Road closure tomorrow"
 *   Program       a service you can claim         "Free medical mission"
 *
 * The old five — News, Advisory, Event, Health, Youth — mixed the SUBJECT of
 * a post with its KIND. "Health" says what it is about; "Advisory" says how
 * fast you need to read it. Sorted by subject, a typhoon advisory and a
 * feeding-programme recap sit in the same pile.
 *
 * The distinction that does the most work is Event against Activity: the
 * same medical mission is an Event before it happens and an Activity after,
 * and only one of the two is worth putting on a resident's calendar.
 *
 * Each kind then carries the fields its own kind needs. An event without a
 * venue is not an invitation, and an advisory without an expiry is a warning
 * nobody can tell is over.
 */
return new class extends Migration
{
    public function up(): void
    {
        /*
         * The enum is widened BEFORE anything is renamed, so no row is ever
         * holding a value its column will not accept.
         */
        DB::statement(
            "ALTER TABLE announcements MODIFY category
             ENUM('News','Advisory','Event','Health','Youth',
                  'Announcement','Activity','Program') NOT NULL DEFAULT 'News'"
        );

        Schema::table('announcements', function (Blueprint $table) {
            /*
             * Who the barangay is putting their name to.
             *
             * `created_by` is the ACCOUNT that typed it, which is an audit
             * fact and not a byline — the office wants "SK Secretary" on the
             * post, not the login of whoever was at the desk.
             */
            $table->string('author_name', 120)->nullable()->after('body');

            /* One line the cards show, so a card is not a truncated essay. */
            $table->string('excerpt', 300)->nullable()->after('author_name');

            /* Draft / Published / Archived, replacing a two-state boolean. */
            $table->enum('status', ['Draft', 'Published', 'Archived'])
                ->default('Draft')->after('excerpt');

            /* The one post the page leads with. Not always the newest. */
            $table->boolean('is_featured')->default(false)->after('status');

            /* Event: what somebody needs in order to turn up. */
            $table->string('organizer', 150)->nullable()->after('event_time');
            $table->string('contact_info', 150)->nullable()->after('organizer');
            $table->date('registration_deadline')->nullable()->after('contact_info');

            /* Activity: what was done, when, and by whom. */
            $table->date('completed_at')->nullable()->after('registration_deadline');
            $table->string('participants', 255)->nullable()->after('completed_at');

            /*
             * Advisory: when it starts to matter and when it stops.
             *
             * The expiry is the one that earns its keep. A water-interruption
             * notice with no end date stays at the top of the page looking
             * current for a month.
             */
            $table->dateTime('effective_at')->nullable()->after('participants');
            $table->dateTime('expires_at')->nullable()->after('effective_at');
            $table->enum('urgency', ['Low', 'Medium', 'High', 'Critical'])
                ->nullable()->after('expires_at');

            $table->index(['status', 'category']);
        });

        /*
         * Subject becomes kind.
         *
         * "Health" was almost always a programme the barangay was offering,
         * and "Youth" an SK activity that had already happened. Neither
         * guess is certain, which is why the office can change the kind on
         * any post from the form — this only decides where they start.
         */
        DB::table('announcements')->where('category', 'News')->update(['category' => 'Announcement']);
        DB::table('announcements')->where('category', 'Health')->update(['category' => 'Program']);
        DB::table('announcements')->where('category', 'Youth')->update(['category' => 'Activity']);

        /* A published post stays published; the third state is new. */
        DB::table('announcements')->where('is_published', true)->update(['status' => 'Published']);
        DB::table('announcements')->where('is_published', false)->update(['status' => 'Draft']);

        /*
         * The excerpt starts as the opening of the body, so no card is blank
         * on the day this ships. The office can write a better one.
         */
        DB::statement(
            "UPDATE announcements
             SET excerpt = TRIM(SUBSTRING(REPLACE(REPLACE(body, '\r', ' '), '\n', ' '), 1, 200))
             WHERE excerpt IS NULL"
        );

        DB::statement(
            "ALTER TABLE announcements MODIFY category
             ENUM('Announcement','Event','Activity','Advisory','Program')
             NOT NULL DEFAULT 'Announcement'"
        );

        Schema::table('announcements', function (Blueprint $table) {
            $table->dropColumn('is_published');
        });
    }

    public function down(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->boolean('is_published')->default(true)->after('body');
        });

        DB::statement(
            "ALTER TABLE announcements MODIFY category
             ENUM('News','Advisory','Event','Health','Youth',
                  'Announcement','Activity','Program') NOT NULL DEFAULT 'News'"
        );

        DB::table('announcements')->where('status', 'Published')->update(['is_published' => true]);
        DB::table('announcements')->whereIn('status', ['Draft', 'Archived'])->update(['is_published' => false]);

        DB::table('announcements')->where('category', 'Announcement')->update(['category' => 'News']);
        DB::table('announcements')->where('category', 'Program')->update(['category' => 'Health']);
        DB::table('announcements')->where('category', 'Activity')->update(['category' => 'Youth']);

        DB::statement(
            "ALTER TABLE announcements MODIFY category
             ENUM('News','Advisory','Event','Health','Youth') NOT NULL DEFAULT 'News'"
        );

        Schema::table('announcements', function (Blueprint $table) {
            $table->dropIndex(['status', 'category']);
            $table->dropColumn([
                'author_name', 'excerpt', 'status', 'is_featured',
                'organizer', 'contact_info', 'registration_deadline',
                'completed_at', 'participants',
                'effective_at', 'expires_at', 'urgency',
            ]);
        });
    }
};
