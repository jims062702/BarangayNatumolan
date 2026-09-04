<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of the RBIM member grid, and the meaning of every code on it.
 *
 * The code lists live here, once. They are printed in the notes at the foot
 * of each spread of the paper form, and an encoder types the number the
 * interviewer wrote — so the numbers are what is stored, and translating
 * them is a read-time concern.
 *
 * Keeping the lists in the model rather than in the migration means the
 * frontend can ask for them: one source for the dropdowns, the labels on the
 * printed summary, and the validation.
 */
class RbimCensusMember extends Model
{
    protected $guarded = ['id'];

    public function census(): BelongsTo
    {
        return $this->belongsTo(RbimCensus::class, 'rbim_census_id');
    }

    /** The registry record this line was matched to, once reviewed. */
    public function resident(): BelongsTo
    {
        return $this->belongsTo(Resident::class);
    }

    /* ------------------------------------------------------------------ */
    /* The code lists, exactly as the form prints them                     */
    /* ------------------------------------------------------------------ */

    /** Q2 — relationship to the household head. */
    public const RELATIONSHIPS = [
        1 => 'Head', 2 => 'Spouse', 3 => 'Son', 4 => 'Daughter',
        5 => 'Stepson', 6 => 'Stepdaughter', 7 => 'Son-in-law',
        8 => 'Daughter-in-law', 9 => 'Grandson', 10 => 'Granddaughter',
        11 => 'Father', 12 => 'Mother', 13 => 'Brother', 14 => 'Sister',
        15 => 'Uncle', 16 => 'Aunt', 17 => 'Nephew', 18 => 'Niece',
        19 => 'Other relative', 20 => 'Non-relative', 21 => 'Boarder',
        22 => 'Domestic helper',
    ];

    public const SEXES = [1 => 'Male', 2 => 'Female'];

    public const NATIONALITIES = [1 => 'Filipino', 2 => 'Non-Filipino'];

    /** Q8 — marital status. */
    public const MARITAL_STATUSES = [
        1 => 'Single', 2 => 'Married', 3 => 'Living-in', 4 => 'Widowed',
        5 => 'Separated', 6 => 'Divorced', 7 => 'Unknown',
    ];

    /** Q11 — highest level of education completed. */
    public const EDUCATION_LEVELS = [
        0 => 'No education', 1 => 'Pre-school', 2 => 'Elementary level',
        3 => 'Elementary graduate', 4 => 'High school level',
        5 => 'High school graduate', 6 => 'Junior HS',
        7 => 'Junior HS graduate', 8 => 'Senior HS level',
        9 => 'Senior HS graduate', 10 => 'Vocational/Technical',
        11 => 'College level', 12 => 'College graduate', 13 => 'Post-graduate',
    ];

    public const ENROLLMENT = [1 => 'Yes, public', 2 => 'Yes, private', 3 => 'No'];

    public const SCHOOL_LEVELS = [
        0 => 'Pre-school', 1 => 'Elementary', 2 => 'Junior High School',
        3 => 'Senior High School', 4 => 'Vocational/Technical',
        5 => 'College/University',
    ];

    /** Q16 — major source of income. */
    public const INCOME_SOURCES = [
        1 => 'Employment', 2 => 'Business', 3 => 'Remittance',
        4 => 'Investments', 5 => 'Others',
    ];

    /** Q17 — status of work or business. */
    public const WORK_STATUSES = [
        1 => 'Permanent work', 2 => 'Casual work', 3 => 'Contractual work',
        4 => 'Individually owned business', 5 => 'Shared/Partnership business',
        6 => 'Corporate business',
    ];

    /** Q19 — place of delivery. */
    public const DELIVERY_PLACES = [
        1 => 'Public hospital', 2 => 'Private hospital',
        3 => 'Lying-in clinic', 4 => 'Home',
    ];

    /** Q20 — who attended the delivery. */
    public const BIRTH_ATTENDANTS = [1 => 'Doctor', 2 => 'Nurse', 3 => 'Midwife', 4 => 'Hilot'];

    /** Q23/Q25 — family planning method. */
    public const FP_METHODS = [
        0 => 'None',
        1 => 'Female sterilization/Ligation', 2 => 'Male sterilization/Vasectomy',
        3 => 'IUD', 4 => 'Injectables', 5 => 'Implants', 6 => 'Pill',
        7 => 'Condom', 8 => 'Modern natural FP',
        9 => 'Lactational Amenorrhea Method (LAM)',
    ];

    /** Q24 — where the method was obtained. */
    public const FP_SOURCES = [
        1 => 'Government hospital', 2 => 'RHU/Health center',
        3 => 'Brgy. Health Station', 4 => 'Private hospital', 5 => 'Pharmacy',
    ];

    /** Q26 — primary health insurance. */
    public const HEALTH_INSURANCE = [
        1 => 'PhilHealth paying member', 2 => 'PhilHealth dependent of paying member',
        3 => 'PhilHealth indigent member', 4 => 'PhilHealth dependent of indigent member',
        5 => 'GSIS', 6 => 'SSS', 7 => 'Private/HMO',
    ];

    /** Q27 — facility visited in the past 12 months. */
    public const FACILITIES = [
        1 => 'Government hospital', 2 => 'RHU/Health center',
        3 => 'Brgy. Health Station', 4 => 'Private hospital',
        5 => 'Private clinic', 6 => 'Pharmacy', 7 => 'Hilot/Herbalist',
    ];

    /** Q28 — reason for the visit. */
    public const VISIT_REASONS = [
        1 => 'Sick/Injured', 2 => 'Prenatal/Postnatal', 3 => 'Gave birth',
        4 => 'Dental', 5 => 'Medical check-up', 6 => 'Medical requirement',
        7 => 'NHTS/CCT/4Ps requirement',
    ];

    /** Q29 — disability. */
    public const DISABILITIES = [
        1 => 'Psychosocial Disability', 2 => 'Chronic Illness',
        3 => 'Learning Disability', 4 => 'Mental Disability',
        5 => 'Visual Disability', 6 => 'Orthopedic Disability',
        7 => 'Hearing Disability', 8 => 'Speech Impairment',
        9 => 'Multiple Disability',
    ];

    /** Q30 — solo parent. */
    public const SOLO_PARENT = [
        1 => 'Registered Solo Parent', 2 => 'Non-Solo Parent',
        3 => 'Unregistered Solo Parent',
    ];

    public const YES_NO = [1 => 'Yes', 2 => 'No'];

    /** Q36 — worked out from Q33–Q35, never asked. */
    public const RESIDENT_TYPES = [1 => 'Non-migrant', 2 => 'Migrant', 3 => 'Transient'];

    /** Q38 — reasons for leaving the previous residence. */
    public const LEAVE_REASONS = [
        1 => 'Lack of employment',
        2 => 'Perception of better income in other place',
        3 => 'Schooling',
        4 => 'Presence of relatives and friends in other place',
        5 => 'Employment/Job Relocation',
        6 => 'Disaster-related Relocation',
        7 => 'Retirement',
        8 => 'To live with Parents',
        9 => 'To live with Children',
        10 => 'Marriage',
        11 => 'Annulment/Divorce/Separation',
        12 => 'Commuting-related Reasons',
        13 => 'Health-related Reasons',
        14 => 'Peace and Security',
        15 => 'Others',
    ];

    /** Q40 — reasons for transferring into this barangay. */
    public const TRANSFER_REASONS = [
        1 => 'Availability of jobs',
        2 => 'Higher wage',
        3 => 'Presence of schools or universities',
        4 => 'Presence of relatives and friends in other place',
    ];

    /** Q43 — skills development training the member is interested in. */
    public const TRAININGS = [
        1 => 'Refrigeration and Airconditioning',
        2 => 'Automotive/Heavy Equipment Servicing',
        3 => 'Metal Worker',
        4 => 'Building Wiring Installation',
        5 => 'Heavy Equipment Operation',
        6 => 'Plumbing',
        7 => 'Welding',
    ];

    /** Q44 — the most prominent skill the member already has. */
    public const SKILLS = [
        1 => 'Refrigeration and Airconditioning',
        2 => 'Automotive/Heavy Equipment Servicing',
        3 => 'Metal Worker',
        4 => 'Building Wiring Installation',
        5 => 'Heavy Equipment Operation',
        6 => 'Plumbing',
        7 => 'Welding',
        8 => 'Carpentry',
        9 => 'Baking',
        10 => 'Dressmaking',
        11 => 'Linguist',
        12 => 'Computer Graphics',
        13 => 'Painting',
        14 => 'Beauty Care',
        15 => 'Commercial Cooking',
        16 => 'Housekeeping',
        17 => 'Massage Therapy',
        18 => 'Others',
    ];

    /** Everything the frontend needs to render every dropdown on the grid. */
    public static function codeLists(): array
    {
        return [
            'relationships' => self::RELATIONSHIPS,
            'sexes' => self::SEXES,
            'nationalities' => self::NATIONALITIES,
            'marital_statuses' => self::MARITAL_STATUSES,
            'education_levels' => self::EDUCATION_LEVELS,
            'enrollment' => self::ENROLLMENT,
            'school_levels' => self::SCHOOL_LEVELS,
            'income_sources' => self::INCOME_SOURCES,
            'work_statuses' => self::WORK_STATUSES,
            'delivery_places' => self::DELIVERY_PLACES,
            'birth_attendants' => self::BIRTH_ATTENDANTS,
            'fp_methods' => self::FP_METHODS,
            'fp_sources' => self::FP_SOURCES,
            'health_insurance' => self::HEALTH_INSURANCE,
            'facilities' => self::FACILITIES,
            'visit_reasons' => self::VISIT_REASONS,
            'disabilities' => self::DISABILITIES,
            'solo_parent' => self::SOLO_PARENT,
            'yes_no' => self::YES_NO,
            'resident_types' => self::RESIDENT_TYPES,
            'leave_reasons' => self::LEAVE_REASONS,
            'transfer_reasons' => self::TRANSFER_REASONS,
            'trainings' => self::TRAININGS,
            'skills' => self::SKILLS,
        ];
    }

    /** The name as the form has it, for a summary line. */
    public function getFullNameAttribute(): string
    {
        return trim(implode(' ', array_filter([
            $this->first_name, $this->middle_name, $this->last_name,
        ])));
    }
}
