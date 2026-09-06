<?php

namespace Database\Seeders;

use App\Models\Announcement;
use App\Models\Appointment;
use App\Models\CertificateClearance;
use App\Models\ChildHealth;
use App\Models\HealthVisit;
use App\Models\Household;
use App\Models\ImmunizationRecord;
use App\Models\LuponCase;
use App\Models\LuponSettlement;
use App\Models\MaternalHealth;
use App\Models\Notification;
use App\Models\PopulationEvent;
use App\Models\Resident;
use App\Models\ResidentSector;
use App\Models\ServiceGuide;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Models\VawcCase;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    private array $staff = [];

    public function run(): void
    {
        $this->seedStaff();
        $residents = $this->seedResidentsAndHouseholds();
        $this->seedFamilies($residents);
        $this->seedPortalAccounts($residents);
        $this->seedServiceGuides();
        $this->seedAnnouncements();
        $this->seedRequestsAndCertificates($residents);
        $this->seedLupon($residents);
        $this->seedHealth($residents);
        $this->seedPopulationEvents($residents);
        $this->seedVawcPlaceholder();
        $this->call(SkSeeder::class);
    }

    private function seedStaff(): void
    {
        $rows = [
            ['Hon. Ricardo M. Balagtas', 'pb@natumolan.local', 'Punong Barangay', 'Main Office'],
            ['Liezel A. Fernandez', 'secretary@natumolan.local', 'Secretary', 'Main Office'],
            ['Marco T. Villarin', 'clerk@natumolan.local', 'Clerk', 'Main Office'],
            ['Maria Lourdes P. Santos', 'vawc@natumolan.local', 'VAWC Officer', 'VAWC'],
            ['Ernesto D. Villanueva', 'lupon@natumolan.local', 'Lupon Secretary', 'Lupon'],
            ['Allan T. Mercado', 'population@natumolan.local', 'Population Worker', 'Population'],
            ['Angelica R. Cruz', 'health@natumolan.local', 'Health Personnel', 'Health Station'],
            ['Hon. Kyla Marie D. Torres', 'sk@natumolan.local', 'SK Chairperson', 'SK'],
            ['System Administrator', 'admin@natumolan.local', 'Admin', 'Admin'],
        ];

        foreach ($rows as [$name, $email, $role, $office]) {
            $this->staff[$role] = User::create([
                'name' => $name,
                'email' => $email,
                'password' => 'password',
                'role' => $role,
                'office' => $office,
                'is_active' => true,
                // Staff accounts are issued by hand to a verified person.
                'activated_at' => now(),
            ]);
        }
    }

    private function seedResidentsAndHouseholds(): array
    {
        $households = [];
        foreach (range(1, 8) as $i) {
            $households[$i] = Household::create([
                'household_number' => 'HH-2026-' . str_pad($i, 4, '0', STR_PAD_LEFT),
                'zone_purok' => 'Purok ' . (($i - 1) % 5 + 1),
                'street_address' => 'Blk ' . $i . ', Natumolan Rd.',
                'house_type' => $i % 2 ? 'Concrete' : 'Semi-concrete',
            ]);
        }

        // [first, middle, last, gender, age, civil, occupation, hh, class]
        $rows = [
            ['Juan', 'Reyes', 'Dela Cruz', 'Male', 34, 'Married', 'Driver', 1, null],
            ['Ana', 'Bautista', 'Dela Cruz', 'Female', 31, 'Married', 'Vendor', 1, null],
            ['Miguel', null, 'Dela Cruz', 'Male', 4, 'Single', null, 1, 'Child'],
            ['Rosa', null, 'Dela Cruz', 'Female', 1, 'Single', null, 1, 'Child'],
            ['Pedro', 'Santos', 'Bautista', 'Male', 68, 'Widowed', 'Retired', 2, 'Senior Citizen'],
            ['Carmen', 'Diaz', 'Bautista', 'Female', 64, 'Widowed', 'Retired', 2, 'Senior Citizen'],
            ['Liza', 'Cruz', 'Ramos', 'Female', 29, 'Single', 'Teacher', 3, 'Solo Parent'],
            ['Nico', null, 'Ramos', 'Male', 3, 'Single', null, 3, 'Child'],
            ['Ramon', 'Torres', 'Aquino', 'Male', 45, 'Married', 'Fisherman', 4, 'PWD'],
            ['Elena', 'Garcia', 'Aquino', 'Female', 41, 'Married', 'Housewife', 4, null],
            ['Grace', null, 'Aquino', 'Female', 26, 'Married', 'Cashier', 4, null],
            ['Mario', 'Perez', 'Lim', 'Male', 52, 'Married', 'Carpenter', 5, null],
            ['Sonia', 'Reyes', 'Lim', 'Female', 49, 'Married', 'Seamstress', 5, null],
            ['Kevin', null, 'Lim', 'Male', 17, 'Single', 'Student', 5, 'Youth'],
            ['Dario', 'Cruz', 'Mendoza', 'Male', 38, 'Married', 'Welder', 6, null],
            ['Nita', 'Uy', 'Mendoza', 'Female', 27, 'Married', 'Housewife', 6, null],
            ['Paolo', null, 'Mendoza', 'Male', 2, 'Single', null, 6, 'Child'],
            ['Teresa', 'Ong', 'Salcedo', 'Female', 73, 'Widowed', 'Retired', 7, 'Senior Citizen'],
            ['Ben', 'Sy', 'Salcedo', 'Male', 40, 'Single', 'Farmer', 7, null],
            ['Karen', 'Lee', 'Uy', 'Female', 24, 'Single', 'Call Center Agent', 8, 'Youth'],
            ['Marites', 'Go', 'Uy', 'Female', 55, 'Married', 'Store Owner', 8, null],
            ['Jose', 'Tan', 'Uy', 'Male', 58, 'Married', 'Tricycle Driver', 8, null],
        ];

        $residents = [];
        foreach ($rows as $i => [$first, $middle, $last, $gender, $age, $civil, $occupation, $hh, $class]) {
            $residents[$i + 1] = Resident::create([
                'resident_number' => '2026-' . str_pad($i + 1, 6, '0', STR_PAD_LEFT),
                'first_name' => $first,
                'middle_name' => $middle,
                // In Philippine naming the middle name IS the mother's maiden
                // surname — recording it separately is what tells two
                // residents with the same name and birthday apart.
                'mother_maiden_name' => $middle,
                'last_name' => $last,
                'gender' => $gender,
                'birthdate' => now()->subYears($age)->subDays(($i * 37) % 300)->toDateString(),
                'civil_status' => $civil,
                'occupation' => $occupation,
                'contact_number' => '+63 917 00' . str_pad($i + 1, 5, '0', STR_PAD_LEFT),
                'household_id' => $households[$hh]->id,
                'residency_status' => 'Permanent',
                'length_of_residence_years' => min($age, 20),
                'zone_purok' => $households[$hh]->zone_purok,
                'demographic_classification' => $class,
                'is_active' => true,
            ]);
        }

        // Household heads = first adult member seeded per household
        foreach ([1 => 1, 2 => 5, 3 => 7, 4 => 9, 5 => 12, 6 => 15, 7 => 18, 8 => 21] as $hh => $ridx) {
            $households[$hh]->update(['household_head_id' => $residents[$ridx]->id]);
        }

        // Sector master-list tags
        $sectorMap = [
            5 => 'Senior Citizen', 6 => 'Senior Citizen', 18 => 'Senior Citizen',
            9 => 'PWD',
            7 => 'Solo Parent',
            14 => 'Youth', 20 => 'Youth',
            3 => 'Children Under Five', 4 => 'Children Under Five', 8 => 'Children Under Five', 17 => 'Children Under Five',
            10 => 'Indigent',
            1 => '4Ps Household',
        ];
        foreach ($sectorMap as $ridx => $sector) {
            ResidentSector::create([
                'resident_id' => $residents[$ridx]->id,
                'sector_type' => $sector,
                'enrolled_date' => now()->subMonths(3)->toDateString(),
                'is_active' => true,
            ]);
        }

        return $residents;
    }

    /**
     * Three generations, so the family view has something to show:
     *
     *   Pedro & Carmen Bautista
     *            |
     *   Ana  ==  Juan Dela Cruz
     *            |
     *   Miguel, Rosa        → whose lolo and lola are Pedro and Carmen
     *
     * Plus two ordinary couples with a child each.
     */
    private function seedFamilies(array $residents): void
    {
        $marry = fn (int $a, int $b) => $residents[$a]->marryTo($residents[$b]);

        // Both ends of the link are written: the same row reads "Father" from
        // below and "Son" from above, so each side stores its own word.
        $parent = function (int $childIdx, int $parentIdx, string $label) use ($residents) {
            $residents[$childIdx]->parents()->syncWithoutDetaching([
                $residents[$parentIdx]->id => [
                    'parent_role' => $label,
                    'child_role' => Resident::roleLabel($residents[$childIdx]->gender, 'child'),
                ],
            ]);
        };

        // Dela Cruz — the three-generation branch.
        $marry(1, 2);
        $parent(3, 1, 'Father');
        $parent(3, 2, 'Mother');
        $parent(4, 1, 'Father');
        $parent(4, 2, 'Mother');
        $parent(2, 5, 'Father');   // Pedro  → Ana
        $parent(2, 6, 'Mother');   // Carmen → Ana

        // Lim.
        $marry(12, 13);
        $parent(14, 12, 'Father');
        $parent(14, 13, 'Mother');

        // Uy.
        $marry(22, 21);
        $parent(20, 22, 'Father');
        $parent(20, 21, 'Mother');

        // Salcedo — a widowed mother and her son.
        $parent(19, 18, 'Mother');

        // Ramos — a solo parent.
        $parent(8, 7, 'Mother');
    }

    /**
     * Portal accounts.
     *
     * Two are seeded ready to use for the demo walkthrough, and one is left
     * UNACTIVATED so the first-sign-in flow (default password, then the code
     * emailed to the resident) can actually be exercised.
     */
    private function seedPortalAccounts(array $residents): void
    {
        $bpo = $this->staff['Population Worker'];

        foreach ([1 => 'resident.juan@natumolan.local', 7 => 'resident.liza@natumolan.local'] as $ridx => $email) {
            // The login address lives on the resident record too, which is
            // what registration now reads when it issues the account.
            $residents[$ridx]->update(['email' => $email]);

            User::create([
                'name' => $residents[$ridx]->full_name,
                'email' => $email,
                'password' => 'password',
                'role' => 'Resident',
                'office' => 'Resident',
                'is_active' => true,
                'activated_at' => now(),
                'resident_id' => $residents[$ridx]->id,
                'created_by' => $bpo->id,
            ]);
        }

        // Ana: exactly what a newly registered resident gets — the standard
        // Lastname + MMDDYY password, and no access until she enters the code.
        $ana = $residents[2];
        $ana->update(['email' => 'resident.ana@natumolan.local']);

        User::create([
            'name' => $ana->full_name,
            'email' => $ana->email,
            'password' => User::defaultPortalPassword($ana),
            'role' => 'Resident',
            'office' => 'Resident',
            'is_active' => true,
            'activated_at' => null,
            'resident_id' => $ana->id,
            'created_by' => $bpo->id,
        ]);
    }

    private function seedServiceGuides(): void
    {
        $guides = [
            ['Main Office', 'Barangay Clearance', 'General clearance certifying no derogatory record in the barangay.', 'Valid ID, proof of residency', '₱50.00', 'Mon–Fri, 8AM–5PM', 'clearance,police,employment,requirement'],
            ['Main Office', 'Certificate of Residency', 'Proof that you are a bona fide resident of Barangay Natumolan.', 'Valid ID', '₱30.00', 'Mon–Fri, 8AM–5PM', 'residency,proof,address'],
            ['Main Office', 'Certificate of Indigency', 'For qualified low-income residents; used for medical, educational, and legal assistance.', 'Valid ID, interview', 'Free', 'Mon–Fri, 8AM–5PM', 'indigency,indigent,assistance,medical,scholarship,free'],
            ['Main Office', 'First-Time Jobseeker Certification', 'Fee exemption certificate under RA 11261 for first-time jobseekers.', 'Valid ID, oath', 'Free', 'Mon–Fri, 8AM–5PM', 'jobseeker,first time,job,work,ra 11261'],
            ['Main Office', 'Business Barangay Clearance', 'Required for new and renewing businesses in the barangay.', 'DTI/SEC registration, lease or land title, valid ID', '₱200.00', 'Mon–Fri, 8AM–5PM', 'business,permit,store,sari-sari,enterprise'],
            ['Main Office', 'Blotter Report', 'Official recording of incidents for documentation and resolution.', 'Valid ID, incident details', 'Free', 'Daily, 24/7 on-duty tanod', 'blotter,incident,report,complaint'],
            ['Lupon', 'Katarungang Pambarangay (Dispute Settlement)', 'Community mediation and conciliation of disputes between residents.', 'Complaint statement, valid ID', 'Filing fee ₱20.00', 'Mon–Fri, 8AM–5PM', 'dispute,away,mediation,settlement,complaint,neighbor,utang,debt'],
            ['VAWC', 'VAWC Assistance', 'Confidential assistance and protection for women and children. Walk in any time — you will be assisted immediately and privately.', 'None — immediate assistance', 'Free', 'Daily, 24/7 hotline', 'vawc,violence,abuse,women,children,protection,bpo,help'],
            ['Health Station', 'Medical Consultation', 'Free basic consultation, vital signs, and health advice.', 'Barangay health record (or register on site)', 'Free', 'Mon–Fri, 8AM–4PM', 'checkup,consultation,sick,medicine,bp,sugar'],
            ['Health Station', 'Child Immunization', 'Routine childhood vaccines per DOH schedule.', "Child's immunization card", 'Free', 'Wed, 8AM–12NN', 'vaccine,bakuna,immunization,child,baby'],
            ['Health Station', 'Prenatal Care', 'Pregnancy registration, prenatal check-ups, and maternal counseling.', 'Valid ID', 'Free', 'Tue & Thu, 8AM–12NN', 'buntis,pregnant,prenatal,mother,delivery'],
            ['Population', 'Resident Registration & Portal Account', 'Register as a resident and request an online portal account (created by the Population Office after verification).', 'Valid ID, proof of residency', 'Free', 'Mon–Fri, 8AM–5PM', 'register,account,portal,online,login,sign up'],
        ];

        foreach ($guides as [$office, $name, $desc, $req, $fees, $sched, $keywords]) {
            ServiceGuide::create([
                'office' => $office,
                'service_name' => $name,
                'description' => $desc,
                'requirements' => $req,
                'fees' => $fees,
                'schedule' => $sched,
                'keywords' => $keywords,
                'is_active' => true,
            ]);
        }
    }

    private function seedAnnouncements(): void
    {
        $pb = $this->staff['Punong Barangay'];

        $rows = [
            ['3rd Quarter Barangay Assembly 2026', 'All residents are invited to the quarterly Barangay Assembly. The council will present accomplishment reports, budget utilization, and upcoming projects.', 'Event', 'Barangay Covered Court', '2026-08-15 09:00:00'],
            ['Free Medical & Dental Mission', 'Free check-ups, dental extraction, BP monitoring, and free medicines for all residents. First come, first served.', 'Health', 'Barangay Health Station', '2026-08-29 07:00:00'],
            ['Coastal & River Clean-Up Drive', 'Join our volunteers and officials in keeping our waterways clean. Gloves, sacks, and refreshments provided.', 'Advisory', 'Natumolan Riverside, Zone 3', '2026-09-12 06:00:00'],
            ['SK Youth Leadership Summit', 'Whole-day summit on leadership and civic engagement for youth aged 15–30. Free registration and meals.', 'Youth', 'Barangay Multi-Purpose Hall', '2026-09-26 08:00:00'],
        ];

        foreach ($rows as $i => [$title, $body, $category, $location, $eventAt]) {
            Announcement::create([
                'title' => $title,
                'body' => $body,
                'category' => $category,
                'location' => $location,
                'event_at' => $eventAt,
                'status' => 'Published',
                'published_at' => now()->subDays($i + 2),
                'created_by' => $pb->id,
            ]);
        }
    }

    private function seedRequestsAndCertificates(array $residents): void
    {
        $clerk = $this->staff['Clerk'];
        $pb = $this->staff['Punong Barangay'];

        $makeRequest = function (int $n, $resident, string $type, string $status, string $channel = 'Walk-in') use ($clerk) {
            return ServiceRequest::create([
                'request_number' => 'REQ-2026-' . str_pad($n, 6, '0', STR_PAD_LEFT),
                'resident_id' => $resident->id,
                'service_type' => $type,
                'office' => 'Main Office',
                'request_type' => $channel,
                'status' => $status,
                'purpose' => 'For ' . strtolower($type) . ' purposes',
                'assigned_to' => $clerk->id,
                'completed_at' => $status === 'Completed' ? now()->subDays(2) : null,
            ]);
        };

        $r1 = $makeRequest(1, $residents[1], 'Barangay Clearance', 'In Progress', 'Online');
        $r2 = $makeRequest(2, $residents[5], 'Certificate of Indigency', 'In Progress');
        $r3 = $makeRequest(3, $residents[7], 'Certificate of Residency', 'Completed', 'Online');
        $makeRequest(4, $residents[12], 'Business Barangay Clearance', 'Pending');
        $r5 = $makeRequest(5, $residents[20], 'First-Time Jobseeker Certification', 'Pending', 'Online');

        /*
         * One certificate at each live stage of the counter workflow, so every
         * button on the Certificates page has something to act on.
         */

        // Asked for online, nobody has started it — the clerk's queue.
        CertificateClearance::create([
            'certificate_number' => 'CERT-2026-000004',
            'resident_id' => $residents[20]->id,
            'service_request_id' => $r5->id,
            'certificate_type' => 'First-Time Jobseeker',
            'purpose' => 'First employment application',
            'fee_amount' => 0,
            'is_exempt' => true,
            'exemption_reason' => 'First-time jobseeker (RA 11261)',
            'status' => 'Pending',
            'reference_number' => 'REF-DEMO0004',
        ]);

        // A clerk has it and is preparing the document.
        CertificateClearance::create([
            'certificate_number' => 'CERT-2026-000001',
            'resident_id' => $residents[1]->id,
            'service_request_id' => $r1->id,
            'certificate_type' => 'Barangay Clearance',
            'purpose' => 'Employment requirement',
            'fee_amount' => 50,
            'status' => 'Processing',
            'processed_by' => $clerk->id,
            'processed_at' => now()->subHours(3),
            'reference_number' => 'REF-DEMO0001',
        ]);

        // Printed, signed, and sitting on the counter — the resident has been
        // told it is ready to claim.
        CertificateClearance::create([
            'certificate_number' => 'CERT-2026-000002',
            'resident_id' => $residents[5]->id,
            'service_request_id' => $r2->id,
            'certificate_type' => 'Certificate of Indigency',
            'purpose' => 'Medical assistance',
            'fee_amount' => 0,
            'is_exempt' => true,
            'exemption_reason' => 'Indigent senior citizen',
            'status' => 'Ready to Claim',
            'processed_by' => $clerk->id,
            'processed_at' => now()->subDays(2),
            'printed_at' => now()->subDay(),
            'signed_by' => $pb->id,
            'signed_at' => now()->subDay(),
            'ready_at' => now()->subDay(),
            'qr_code' => 'qr_' . md5('REF-DEMO0002'),
            'reference_number' => 'REF-DEMO0002',
        ]);

        // Handed over (public verification demo)
        CertificateClearance::create([
            'certificate_number' => 'CERT-2026-000003',
            'resident_id' => $residents[7]->id,
            'service_request_id' => $r3->id,
            'certificate_type' => 'Certificate of Residency',
            'purpose' => 'School enrollment',
            'fee_amount' => 30,
            'status' => 'Released',
            'processed_by' => $clerk->id,
            'processed_at' => now()->subDays(4),
            'printed_at' => now()->subDays(3),
            'signed_by' => $pb->id,
            'signed_at' => now()->subDays(3),
            'ready_at' => now()->subDays(3),
            'released_by' => $this->staff['Secretary']->id,
            'released_at' => now()->subDays(2),
            'claimed_at' => now()->subDays(2),
            'qr_code' => 'qr_' . md5('REF-DEMO0003'),
            'reference_number' => 'REF-DEMO0003',
        ]);

        Appointment::create([
            'appointment_number' => 'APT-2026-00001',
            'service_request_id' => $r1->id,
            'resident_id' => $residents[1]->id,
            'office' => 'Main Office',
            'scheduled_datetime' => now()->addDays(2)->setTime(9, 0),
            'status' => 'Confirmed',
            'notes' => 'Claim stub required',
        ]);

        Notification::notifyResident($residents[1]->id, 'request_status', 'Request REQ-2026-000001 is now In Progress', 'Your Barangay Clearance request is being processed.', 'service_request', $r1->id);
        Notification::notifyResident($residents[1]->id, 'appointment', 'Appointment confirmed', 'Your appointment on ' . now()->addDays(2)->format('M j, Y') . ' 9:00 AM at the Main Office is confirmed.', 'appointment', 1);
    }

    private function seedLupon(array $residents): void
    {
        $sec = $this->staff['Lupon Secretary'];

        // Case in mediation with an upcoming hearing
        $case1 = LuponCase::create([
            'case_number' => 'KP-2026-0001',
            'case_title' => 'Unpaid debt between neighbors',
            'case_classification' => 'Debt',
            'complainant_id' => $residents[12]->id,
            'jurisdiction_status' => 'Accepted',
            'current_stage' => 'Mediation',
            'date_filed' => now()->subDays(6)->toDateString(),
            'assigned_lupon_secretary' => $sec->id,
        ]);
        $case1->respondents()->sync([$residents[19]->id]);
        $case1->complaint()->create([
            'complaint_narrative' => 'Respondent has not paid a P15,000 loan due since March despite repeated demands.',
            'date_of_occurrence' => now()->subMonths(3)->toDateString(),
            'place_of_occurrence' => 'Purok 4',
            'relationship_nature' => 'Neighbor',
            'complaint_received_date' => now()->subDays(6)->toDateString(),
        ]);
        $case1->hearings()->create([
            'hearing_type' => 'Mediation',
            'scheduled_at' => now()->addDays(3)->setTime(14, 0),
            'status' => 'Scheduled',
            'summons_issued' => true,
            'summons_served_date' => now()->subDay()->toDateString(),
            'recorded_by' => $sec->id,
        ]);

        // Settled case inside the 10-day repudiation window
        $case2 = LuponCase::create([
            'case_number' => 'KP-2026-0002',
            'case_title' => 'Boundary fence disagreement',
            'case_classification' => 'Land Dispute',
            'complainant_id' => $residents[15]->id,
            'jurisdiction_status' => 'Accepted',
            'current_stage' => 'Settled',
            'date_filed' => now()->subDays(20)->toDateString(),
            'date_resolved' => now()->subDays(4)->toDateString(),
            'assigned_lupon_secretary' => $sec->id,
        ]);
        $case2->respondents()->sync([$residents[21]->id]);
        $case2->complaint()->create([
            'complaint_narrative' => 'Fence constructed half a meter beyond the agreed lot boundary.',
            'date_of_occurrence' => now()->subMonth()->toDateString(),
            'place_of_occurrence' => 'Purok 2',
            'relationship_nature' => 'Neighbor',
            'complaint_received_date' => now()->subDays(20)->toDateString(),
        ]);
        LuponSettlement::create([
            'lupon_case_id' => $case2->id,
            'settlement_type' => 'Amicable Settlement',
            'terms' => 'Respondent to move the fence to the surveyed boundary within 30 days; complainant shoulders half of the relocation cost.',
            'date_agreed' => now()->subDays(4)->toDateString(),
            'repudiation_deadline' => now()->addDays(6)->toDateString(),
            'status' => 'Within Repudiation Period',
            'compliance_deadline' => now()->addDays(34)->toDateString(),
            'recorded_by' => $sec->id,
        ]);
    }

    private function seedHealth(array $residents): void
    {
        $nurse = $this->staff['Health Personnel'];

        foreach ([[5, 'Hypertension follow-up', '140/90'], [18, 'Arthritis pain', '130/85'], [9, 'Flu symptoms', '120/80']] as $i => [$ridx, $reason, $bp]) {
            HealthVisit::create([
                'patient_id' => $residents[$ridx]->id,
                'visit_date' => now()->subDays($i)->toDateString(),
                'visit_reason' => $reason,
                'temperature' => 36.5 + $i * 0.4,
                'blood_pressure' => $bp,
                'heart_rate' => 72 + $i * 4,
                'service_provider_id' => $nurse->id,
                'treatment_advice' => 'Medication provided; monitor and return if symptoms persist.',
                'followup_schedule' => now()->addWeeks(2)->toDateString(),
            ]);
        }

        // Immunization board: completed, due, missed
        ImmunizationRecord::create([
            'child_id' => $residents[4]->id,
            'vaccine_name' => 'Pentavalent (1st dose)',
            'vaccination_date' => now()->subMonths(2)->toDateString(),
            'administered_by' => $nurse->id,
            'status' => 'Completed',
        ]);
        ImmunizationRecord::create([
            'child_id' => $residents[4]->id,
            'vaccine_name' => 'Pentavalent (2nd dose)',
            'vaccination_date' => now()->addDays(5)->toDateString(),
            'scheduled_date' => now()->addDays(5)->toDateString(),
            'administered_by' => $nurse->id,
            'status' => 'Pending',
        ]);
        ImmunizationRecord::create([
            'child_id' => $residents[17]->id,
            'vaccine_name' => 'MMR (1st dose)',
            'vaccination_date' => now()->subDays(10)->toDateString(),
            'scheduled_date' => now()->subDays(10)->toDateString(),
            'administered_by' => $nurse->id,
            'status' => 'Missed',
        ]);

        MaternalHealth::create([
            'mother_id' => $residents[10]->id,
            'pregnancy_registration_date' => now()->subMonths(4)->toDateString(),
            'expected_delivery_date' => now()->addMonths(5)->toDateString(),
            'prenatal_visits_count' => 3,
            'risk_indicators' => 'None noted',
            'maternal_immunization_received' => true,
            'status' => 'Active',
        ]);

        ChildHealth::create([
            'child_id' => $residents[3]->id,
            'birth_date' => $residents[3]->birthdate->toDateString(),
            'birth_weight' => 3.1,
            'current_weight' => 15.8,
            'current_height' => 101.5,
            'nutritional_status' => 'Normal',
            'vitamin_services_received' => true,
            'breastfeeding_status' => 'Weaned',
        ]);
    }

    private function seedPopulationEvents(array $residents): void
    {
        $bpo = $this->staff['Population Worker'];

        $rows = [
            ['Birth', 4, 'Baby girl Rosa Dela Cruz born at Tagoloan District Hospital.', 'Verified'],
            ['Transfer In', 20, 'Karen Uy moved in from Cagayan de Oro City.', 'Verified'],
            ['Address Change', 12, 'Moved from Purok 1 to Purok 4 within the barangay.', 'Pending'],
        ];

        foreach ($rows as $i => [$type, $ridx, $description, $status]) {
            PopulationEvent::create([
                'event_type' => $type,
                'resident_id' => $residents[$ridx]->id,
                'event_date' => now()->subDays(10 + $i * 9)->toDateString(),
                'description' => $description,
                'verification_status' => $status,
                'recorded_by' => $bpo->id,
            ]);
        }
    }

    /**
     * One demo VAWC case with an OBVIOUS placeholder identity —
     * never seed realistic survivor details.
     */
    private function seedVawcPlaceholder(): void
    {
        $officer = $this->staff['VAWC Officer'];

        $placeholder = Resident::create([
            'resident_number' => '2026-999999',
            'first_name' => 'DEMO',
            'last_name' => 'PLACEHOLDER-RECORD',
            'gender' => 'Female',
            'residency_status' => 'Permanent',
            'zone_purok' => 'Purok 1',
            'is_active' => true,
            'remarks' => 'Placeholder record for VAWC module demo only — not a real person.',
        ]);

        $case = VawcCase::create([
            'case_code' => 'VAWC-2026-0001',
            'survivor_id' => $placeholder->id,
            'violence_type' => 'Psychological',
            'relationship_to_offender' => 'Spouse (demo data)',
            'children_involved' => true,
            'children_count' => 1,
            'immediate_needs' => 'Demo: counseling referral',
            'previous_incidents_count' => 0,
            'assigned_vawc_officer' => $officer->id,
            'status' => 'Active',
            'confidential_notes' => 'Demo confidential note — encrypted at rest.',
            'report_date' => now()->subDays(7)->toDateString(),
        ]);

        $case->referrals()->create([
            'referral_agency' => 'Counseling Service',
            'receiving_person' => 'MSWDO Counselor (demo)',
            'services_requested' => 'Psychosocial counseling session',
            'referral_date' => now()->subDays(6)->toDateString(),
            'followup_schedule' => now()->addDays(3)->toDateString(),
        ]);

        $case->followups()->create([
            'followup_date' => now()->subDays(2)->toDateString(),
            'followup_type' => 'Phone Call',
            'safety_status' => 'Safe',
            'bpo_compliance' => 'No BPO',
            'notes' => 'Demo follow-up note.',
            'next_followup_date' => now()->addDays(5)->toDateString(),
            'recorded_by' => $officer->id,
        ]);
    }
}
