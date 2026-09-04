<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One link, two directions, two different words.
 *
 * `relationship` tried to describe a parent/child link with a single value,
 * but the link reads differently from each end: the same row is "Father" from
 * below and "Son" from above. Whichever end the clerk happened to enter it
 * from won, so a parent added through "Add child" showed up on their own
 * child's profile labelled **Son** — visibly wrong, and the reason a resident
 * could not see who their father was.
 *
 * Each side now gets its own word, and both are filled at once: the one the
 * clerk chose, and the other derived from the person's sex.
 */
return new class extends Migration
{
    /** Words that describe the PARENT end of the link. */
    private const PARENT_WORDS = ['Mother', 'Father', 'Guardian', 'Step-mother', 'Step-father'];

    public function up(): void
    {
        Schema::table('resident_parents', function (Blueprint $table) {
            $table->string('parent_role', 40)->nullable()->after('parent_id');
            $table->string('child_role', 40)->nullable()->after('parent_role');
        });

        // Put every existing label on the end it actually describes, and
        // derive the other end from the person's sex.
        $rows = DB::table('resident_parents as rp')
            ->leftJoin('residents as c', 'c.id', '=', 'rp.child_id')
            ->leftJoin('residents as p', 'p.id', '=', 'rp.parent_id')
            ->select('rp.id', 'rp.relationship', 'c.gender as child_gender', 'p.gender as parent_gender')
            ->get();

        foreach ($rows as $row) {
            $label = trim((string) $row->relationship);
            $describesParent = $label !== '' && in_array($label, self::PARENT_WORDS, true);

            DB::table('resident_parents')->where('id', $row->id)->update([
                'parent_role' => $describesParent ? $label : self::role($row->parent_gender, 'parent'),
                'child_role' => $describesParent || $label === ''
                    ? self::role($row->child_gender, 'child')
                    : $label,
            ]);
        }

        // Two sources of truth for the same fact is what caused this.
        Schema::table('resident_parents', function (Blueprint $table) {
            $table->dropColumn('relationship');
        });
    }

    private static function role(?string $gender, string $side): string
    {
        return match ([$side, $gender]) {
            ['parent', 'Male'] => 'Father',
            ['parent', 'Female'] => 'Mother',
            ['child', 'Male'] => 'Son',
            ['child', 'Female'] => 'Daughter',
            default => $side === 'parent' ? 'Parent' : 'Child',
        };
    }

    public function down(): void
    {
        Schema::table('resident_parents', function (Blueprint $table) {
            $table->string('relationship', 40)->nullable();
        });

        DB::statement('UPDATE resident_parents SET relationship = parent_role');

        Schema::table('resident_parents', function (Blueprint $table) {
            $table->dropColumn(['parent_role', 'child_role']);
        });
    }
};
