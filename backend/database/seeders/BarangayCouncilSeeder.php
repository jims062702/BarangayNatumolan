<?php

namespace Database\Seeders;

use App\Models\Official;
use App\Support\LandingCache;
use Illuminate\Database\Seeder;

/**
 * The council whose names go on the paper.
 *
 * Taken from the barangay's own 2026 certificate templates — the sidebar down
 * the left of the Barangay Clearance — and not from the fee ordinance of
 * January 2020, which lists a different council entirely. Only Punong
 * Barangay Vidal and Kagawad Lim appear on both.
 *
 * The point of putting them here rather than in the printed template is that
 * a council changes. When it does, the barangay edits this list once through
 * Officials and every certificate follows; the alternative is what they have
 * now, which is finding and editing ten Word files and missing one.
 *
 *     php artisan db:seed --class=Database\Seeders\BarangayCouncilSeeder
 *
 * TWO SPELLINGS NEED CONFIRMING, and both are the barangay's own documents
 * disagreeing with themselves rather than a transcription doubt:
 *
 *   - the Secretary is "GRACE L. GALOLA" on page 1 of the clearance and
 *     "GRACE G. GALOLA" on pages 2 and 3 of the same file. Seeded as G,
 *     which is the reading that appears six times against three.
 *   - the Kagawad is "MARIVIC B. AJON" on the 2026 templates and "MARVIC B.
 *     AJON" in the 2020 ordinance. Seeded as the newer spelling.
 *
 * Either is one edit on the Officials screen if it is wrong, which is the
 * whole reason it is data.
 */
class BarangayCouncilSeeder extends Seeder
{
    public function run(): void
    {
        /*
         * Name, committees, order — the committees because that is what the
         * clearance sidebar prints under each name, and without them the
         * panel said "Barangay Kagawad" seven times over and told a resident
         * nothing about who to ask.
         */
        $council = [
            ['Punong Barangay', 'HON. RAFAEL P. VIDAL', null, 1],
            ['Barangay Kagawad', 'HON. ANGELIE QUIN M. AGUSTERO',
                'Committee on Tourism and Culture, Committee on Clean & Green/ Ecology, Environmental Protection', 2],
            ['Barangay Kagawad', 'HON. JOSEPHINE S. DARADAR',
                'Committee on Health and Sanitation, Committee on Social Services', 3],
            ['Barangay Kagawad', 'HON. ROSENDO A. MANTO',
                'Committee on Agriculture', 4],
            ['Barangay Kagawad', 'HON. NOVELITO A. PALAPO',
                'Committee on Infrastructure & Electrical, Committee on Transportation and Communication', 5],
            ['Barangay Kagawad', 'HON. LAMBERTO S. NERI',
                'Committee on Labor & Employment, Urban Poor and Senior Citizen', 6],
            ['Barangay Kagawad', 'HON. JOCELYN A. LIM',
                'Committee on Budget & Appropriation, Committee on Ways & Means, Committee on Education', 7],
            ['Barangay Kagawad', 'HON. MARIVIC B. AJON',
                'Committee on Peace and Order, Women & Family Concern, Children & Disable', 8],
            /*
             * L, not G.
             *
             * Page 1 of the clearance reads GRACE L. GALOLA and pages 2 and 3
             * read GRACE G. GALOLA. Page 1 is the sheet the office pointed at
             * as the format, so it wins — but their own file still disagrees
             * with itself, and this is one edit on the Officials screen.
             */
            ['Barangay Secretary', 'GRACE L. GALOLA', null, 9],
            ['Barangay Treasurer', 'DONNA LYN R. QUILANG', null, 10],
        ];

        /*
         * The roster is keyed on POSITION for the single-holder offices, so
         * correcting a spelling renames the holder instead of seating a
         * second one. Keyed on the name, changing GRACE G. to GRACE L. would
         * have put two secretaries in the sidebar.
         */
        Official::where('group', 'Barangay')
            ->whereIn('position', ['Punong Barangay', 'Barangay Secretary', 'Barangay Treasurer'])
            ->whereNotIn('name', array_column($council, 1))
            ->delete();

        foreach ($council as [$position, $name, $committees, $order]) {
            /*
             * Keyed on the name, so running this twice does not produce two
             * of anybody — and so a council member already entered by hand
             * through the Officials screen is topped up rather than doubled.
             */
            Official::updateOrCreate(
                ['group' => 'Barangay', 'name' => $name],
                [
                    'position' => $position,
                    'committees' => $committees,
                    'sort_order' => $order,
                    'is_active' => true,
                ],
            );
        }

        /* The SK chairperson signs nothing on these forms but stands in the
           sidebar, which is where the council is listed in full. */
        Official::updateOrCreate(
            ['group' => 'SK', 'name' => 'HON. MARIA THERESE MARTINEZ'],
            [
                'position' => 'SK Chairperson',
                'committees' => 'Committee on Youth & Sports Development',
                'sort_order' => 1,
                'is_active' => true,
            ],
        );

        /*
         * The public roster is cached for a day. Without this the barangay
         * would seed a council and then watch the old one — or an empty
         * sidebar — go on printing until tomorrow.
         */
        LandingCache::clearOfficials();

        $this->command?->info('Barangay council seeded from the 2026 certificate templates.');
        $this->command?->warn(
            'Confirm two spellings against the barangay\'s records: GRACE L./G. GALOLA, and MARIVIC/MARVIC B. AJON.'
        );
    }
}
