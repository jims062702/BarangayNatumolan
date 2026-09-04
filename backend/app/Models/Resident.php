<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

use App\Support\SequenceNumber;

class Resident extends Model
{
    /*
     * The whole name, sent with every record.
     *
     * There is one rule for writing a name out — a one-letter middle name is
     * an initial and takes a full stop — and it belongs in one place. Without
     * this, every screen that shows a name reimplements it, and the same
     * person reads differently on two of them.
     */
    protected $appends = ['full_name'];

    protected $fillable = [
        'resident_number',
        'record_type',
        'first_name',
        'middle_name',
        // The mother's maiden surname. In Philippine naming this IS the
        // middle name — recording it separately is what lets two people with
        // the same name and birthday be told apart, including when neither
        // has a middle name on file.
        'mother_maiden_name',
        'last_name',
        'suffix',
        'gender',
        'birthdate',
        /*
         * Whether that date is a month's worth of approximation.
         *
         * A census asks for a birth month and year and no day, so a record
         * registered from one carries the end of that month. A clerk about
         * to put it on a certificate needs to know it did not come from a
         * birth certificate.
         */
        'birthdate_is_estimated',
        'birth_place',
        'civil_status',
        'spouse_id',
        'occupation',
        'contact_number',
        'email',
        'household_id',
        'residency_status',
        'length_of_residence_years',
        'zone_purok',
        'address',
        'educational_attainment',
        'demographic_classification',
        'is_active',
        'life_status',
        'date_of_death',
        'life_status_note',
        'remarks',
    ];

    protected $casts = [
        'birthdate' => 'date',
        'birthdate_is_estimated' => 'boolean',
        'date_of_death' => 'date',
        'is_active' => 'boolean',
    ];

    /**
     * Whether the resident is living. Deliberately separate from `is_active`,
     * which only says whether the record is in use — a duplicate and a person
     * who has died are both "inactive", and the office needs to tell them
     * apart.
     */
    public const DECEASED = 'Deceased';

    public function isDeceased(): bool
    {
        return $this->life_status === self::DECEASED;
    }
    /**
     * Someone on a family tree who does not live in the barangay — a mother
     * two towns over, a spouse who never moved here.
     *
     * They have to exist so the family can be recorded, but they are not a
     * constituent: no portal account, not in the population count, and none
     * of the residency fields apply to them.
     */
    public const NON_RESIDENT = 'Non-resident';

    public function isNonResident(): bool
    {
        return $this->record_type === self::NON_RESIDENT;
    }

    /**
     * The people the barangay actually serves. Every population count,
     * sector list and public statistic must go through this — a non-resident
     * in those numbers is a wrong number reported to the municipality.
     */
    public function scopeBonafide($query)
    {
        return $query->where('record_type', '!=', self::NON_RESIDENT);
    }
    /**
     * The age-derived sector tags the system manages automatically. The
     * `residents:sync-sectors` command reconciles ONLY these; manual tags
     * (Solo Parent, PWD, 4Ps, …) are left untouched.
     */
    public const AGE_SECTORS = ['Child', 'Youth', 'Adult', 'Senior Citizen'];

    /**
     * Name/number lookup used by every resident search in the system.
     *
     * The term is split on whitespace and EVERY word must match one of the
     * name columns, so "Juan Dela Cruz" finds the resident whose first name
     * is Juan and last name is Dela Cruz. Matching the whole phrase against
     * one column at a time — the obvious approach — can never match a full
     * name, because no single column holds it.
     *
     * The whole thing is wrapped in one closure so callers can safely chain
     * further constraints without the ORs escaping the group.
     */
    public function scopeNameSearch($query, ?string $term)
    {
        $words = preg_split('/\s+/', trim((string) $term), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        if ($words === []) {
            return $query;
        }

        return $query->where(function ($outer) use ($words) {
            foreach ($words as $word) {
                $outer->where(function ($inner) use ($word) {
                    $inner->where('first_name', 'like', "%{$word}%")
                        ->orWhere('middle_name', 'like', "%{$word}%")
                        ->orWhere('last_name', 'like', "%{$word}%")
                        ->orWhere('suffix', 'like', "%{$word}%")
                        ->orWhere('resident_number', 'like', "%{$word}%");
                });
            }
        });
    }

    /**
     * Age-based sectors for this resident today (mirrors the registration form):
     *   0–14 Child · 15–17 Child + Youth · 18–30 Youth · 31–59 Adult · 60+ Senior.
     * A resident can fall in more than one (the 15–17 overlap).
     */
    /**
     * The next record number to issue.
     *
     * Here rather than in a controller because there is now more than one
     * way onto the register — the resident form and an RBIM census — and the
     * two must agree on the format. They did not: a second copy of this rule
     * used four digits where the register uses six, which asked for
     * "2026-0043" while the register was already at "2026-000042", and the
     * series looked exhausted at 9999.
     *
     * One above the highest ever issued; see SequenceNumber for why counting
     * rows is not the same thing. "NR-2026-" never matches "2026-", so the
     * two series never collide.
     */
    public static function nextNumber(bool $nonResident = false): string
    {
        $year = date('Y');

        return $nonResident
            ? SequenceNumber::next('residents', 'resident_number', 'NR-' . $year . '-', 4)
            : SequenceNumber::next('residents', 'resident_number', $year . '-', 6);
    }

    public function ageSectors(): array
    {
        $age = $this->birthdate?->age;
        if ($age === null) {
            return [];
        }
        if ($age <= 14) {
            return ['Child'];
        }
        if ($age <= 17) {
            return ['Child', 'Youth'];
        }
        if ($age <= 30) {
            return ['Youth'];
        }
        if ($age <= 59) {
            return ['Adult'];
        }
        return ['Senior Citizen'];
    }

    /**
     * The single primary classification (the age bracket). This is what the
     * `demographic_classification` column holds — always derived from age, never
     * set by hand: 0–14 Child · 15–30 Youth · 31–59 Adult · 60+ Senior. Everything
     * else (PWD, Solo Parent, …) lives in the many-valued sector tags instead.
     */
    public function primaryAgeClassification(): ?string
    {
        $age = $this->birthdate?->age;
        if ($age === null) {
            return null;
        }
        if ($age <= 14) {
            return 'Child';
        }
        if ($age <= 30) {
            return 'Youth';
        }
        if ($age <= 59) {
            return 'Adult';
        }
        return 'Senior Citizen';
    }

    /**
     * Bring the age-derived data in line with the resident's CURRENT age:
     * activate the age bracket(s) they belong in, deactivate any they've grown
     * out of (so a birthday flips Child → Youth on its own, dropping Child), and
     * keep `demographic_classification` on the primary bracket. Only the four
     * age sectors are touched; manual tags are untouched. Called on view, so the
     * record self-heals without waiting for the periodic sync command. Returns
     * whether anything changed.
     */
    public function reconcileAgeData(): bool
    {
        if (!$this->birthdate) {
            return false;
        }

        $this->loadMissing('sectors');
        $changed = false;

        $want = $this->ageSectors();
        $managed = $this->sectors->whereIn('sector_type', self::AGE_SECTORS);
        $activeNow = $managed->where('is_active', true)->pluck('sector_type')->all();

        foreach (array_diff($want, $activeNow) as $sector) {
            $changed = true;
            $existing = $managed->firstWhere('sector_type', $sector);
            if ($existing) {
                $existing->update(['is_active' => true, 'unenrolled_date' => null]);
            } else {
                $this->sectors()->create([
                    'sector_type' => $sector,
                    'enrolled_date' => now()->toDateString(),
                ]);
            }
        }

        foreach (array_diff($activeNow, $want) as $sector) {
            $changed = true;
            $managed->firstWhere('sector_type', $sector)
                ?->update(['is_active' => false, 'unenrolled_date' => now()->toDateString()]);
        }

        $primary = $this->primaryAgeClassification();
        if ($primary && $this->demographic_classification !== $primary) {
            $this->demographic_classification = $primary;
            $this->save();
            $changed = true;
        }

        if ($changed) {
            $this->unsetRelation('sectors'); // force a fresh reload after changes
        }

        return $changed;
    }

    // Relationships
    public function household(): BelongsTo
    {
        return $this->belongsTo(Household::class);
    }

    /** The resident's portal login account, if one has been issued. */
    public function account()
    {
        return $this->hasOne(User::class, 'resident_id');
    }

    public function sectors(): HasMany
    {
        return $this->hasMany(ResidentSector::class);
    }

    public function serviceRequests(): HasMany
    {
        return $this->hasMany(ServiceRequest::class);
    }

    public function certificates(): HasMany
    {
        return $this->hasMany(CertificateClearance::class);
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function vawcCases(): HasMany
    {
        return $this->hasMany(VawcCase::class, 'survivor_id');
    }

    public function luponCases(): HasMany
    {
        return $this->hasMany(LuponCase::class, 'complainant_id');
    }

    public function healthVisits(): HasMany
    {
        return $this->hasMany(HealthVisit::class, 'patient_id');
    }

    public function referrals(): HasMany
    {
        return $this->hasMany(Referral::class);
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    public function maternalHealth(): HasMany
    {
        return $this->hasMany(MaternalHealth::class, 'mother_id');
    }

    public function childHealth(): HasMany
    {
        return $this->hasMany(ChildHealth::class, 'child_id');
    }

    /*
    |--------------------------------------------------------------------------
    | Family
    |--------------------------------------------------------------------------
    | Parent/child is one join table read from both ends, which is what makes
    | grandparents free: they are the parents of this resident's parents.
    | Marriage is a mutual pointer on the row itself — a person has at most one
    | current spouse — and it is what lets a child added to one parent attach
    | to the other automatically.
    */

    /** This resident's mother and father. NOT their guardian — see below. */
    public function parents(): BelongsToMany
    {
        return $this->belongsToMany(Resident::class, 'resident_parents', 'child_id', 'parent_id')
            // Both ends of the link travel with it: the same row is "Father"
            // read from below and "Son" read from above, and showing the
            // wrong one is how a father ended up labelled Son on his own
            // child's profile.
            ->withPivot('parent_role', 'child_role')
            ->withTimestamps();
    }

    /** Everyone this resident is recorded as a parent of. */
    public function children(): BelongsToMany
    {
        return $this->belongsToMany(Resident::class, 'resident_parents', 'parent_id', 'child_id')
            ->withPivot('parent_role', 'child_role')
            ->withTimestamps();
    }

    /*
    |--------------------------------------------------------------------------
    | Guardianship — who is raising a child when the parents are not
    |--------------------------------------------------------------------------
    | A separate join on purpose. Every derived relation below reads the
    | PARENT table, so a lola recorded there as a guardian would make her own
    | children the child's siblings and her parents the child's grandparents.
    | Care is not descent, and the register should not confuse them.
    |
    | Nothing is derived from these links. They say one thing only: this child
    | lives with this person, for this reason, since this date.
    */

    /** The people currently raising this resident. */
    public function guardians(): BelongsToMany
    {
        return $this->belongsToMany(Resident::class, 'resident_guardians', 'ward_id', 'guardian_id')
            ->withPivot('id', 'relation', 'reason', 'started_on', 'ended_on', 'is_primary', 'note')
            ->wherePivotNull('ended_on')
            ->withTimestamps();
    }

    /** The children currently in this resident's care. */
    public function wards(): BelongsToMany
    {
        return $this->belongsToMany(Resident::class, 'resident_guardians', 'guardian_id', 'ward_id')
            ->withPivot('id', 'relation', 'reason', 'started_on', 'ended_on', 'is_primary', 'note')
            ->wherePivotNull('ended_on')
            ->withTimestamps();
    }

    /** Every arrangement over this child's life, ended ones included. */
    public function guardianships(): HasMany
    {
        return $this->hasMany(Guardianship::class, 'ward_id')->latest('id');
    }

    /** Every child this resident has ever been recorded as raising. */
    public function wardships(): HasMany
    {
        return $this->hasMany(Guardianship::class, 'guardian_id')->latest('id');
    }

    /** Under 18. Unknown birthdate is not treated as a minor. */
    public function isMinor(): bool
    {
        $age = $this->birthdate?->age;

        return $age !== null && $age < 18;
    }

    /**
     * Whether every recorded parent is unable to be raising this child here —
     * living outside the barangay, or dead.
     *
     * This is the shape that needs a guardian on file: the child is a bona
     * fide resident, and not one of the people responsible for them is. It
     * returns false when no parent is recorded at all, because "we do not
     * know yet" is a different problem from "both are away".
     */
    public function parentsAreAway(): bool
    {
        $this->loadMissing('parents');

        if ($this->parents->isEmpty()) {
            return false;
        }

        return $this->parents->every(
            fn ($parent) => $parent->isNonResident() || $parent->isDeceased()
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Parents and children
    |--------------------------------------------------------------------------
    | Every recorded parent is a parent. Step relationships are not modelled:
    | the register records who a child's parents are, and a parent's new
    | spouse is recorded as a spouse — of the parent, not of the child's
    | descent.
    |
    | bloodParents()/bloodChildren() are kept as the names the derivations
    | below read, so grandparents, siblings, aunts and cousins all continue to
    | be worked out from one place.
    */

    /** The recorded parents. */
    public function bloodParents()
    {
        $this->loadMissing('parents');

        return new EloquentCollection($this->parents->values()->all());
    }

    /** The recorded children. */
    public function bloodChildren()
    {
        $this->loadMissing('children');

        return new EloquentCollection($this->children->values()->all());
    }

    /**
     * Whether a sibling is a full or a half sibling — or whether the register
     * does not yet know.
     *
     * "Half" is only said when it can be PROVEN: they share one parent, and at
     * least one of the two has a second parent on record who is therefore not
     * shared. Where only one parent is recorded on both sides the honest answer
     * is the plain word, not a guess dressed up as a fact.
     */
    public function siblingKind(Resident $sibling): string
    {
        $mine = $this->bloodParents()->pluck('id');
        $theirs = $sibling->bloodParents()->pluck('id');
        $shared = $mine->intersect($theirs)->count();

        if ($shared >= 2) {
            return 'sibling';
        }

        return $shared === 1 && ($mine->count() >= 2 || $theirs->count() >= 2)
            ? 'half_sibling'
            : 'sibling';
    }

    /**
     * What to call someone, from the point of view of the person whose card
     * they appear on.
     *
     * Every derived group needs its own word — a grandmother is not "Mother",
     * a sibling is not "Son" — and a family panel that prints the stored link
     * label everywhere gets all of them wrong. Sex decides the word; where
     * none is recorded the neutral term is used rather than a guess.
     */
    public static function roleLabel(?string $gender, string $kind): string
    {
        $male = $gender === 'Male';
        $female = $gender === 'Female';

        return match ($kind) {
            'parent' => $male ? 'Father' : ($female ? 'Mother' : 'Parent'),
            'child' => $male ? 'Son' : ($female ? 'Daughter' : 'Child'),
            /*
             * The Filipino word belongs on every card in a group, not only the
             * ones whose sex is on file. A record with no sex recorded was
             * coming out a bare "Grandparent" beside a "Grandmother (Lola)",
             * which reads as two different kinds of relative rather than the
             * same one known in less detail.
             */
            'grandparent' => $male ? 'Grandfather (Lolo)' : ($female ? 'Grandmother (Lola)' : 'Grandparent (Lolo/Lola)'),
            'sibling' => $male ? 'Brother' : ($female ? 'Sister' : 'Sibling (Kapatid)'),
            'aunt_uncle' => $male ? 'Uncle (Tito)' : ($female ? 'Aunt (Tita)' : 'Aunt / Uncle (Tita/Tito)'),
            'cousin' => 'Cousin (Pinsan)',
            // A remarriage, said plainly. The word matters: "Mother" on a
            // step-mother's card is a claim about who bore the child.
            'half_sibling' => $male ? 'Half-brother' : ($female ? 'Half-sister' : 'Half-sibling'),
            // Not a parent word. A guardian who is called "Father" on a card
            // is the same mistake as a guardian stored as a parent.
            'guardian' => 'Guardian',
            'ward' => 'In their care',
            'spouse' => $male ? 'Husband' : ($female ? 'Wife' : 'Spouse'),
            default => '',
        };
    }
    public function spouse(): BelongsTo
    {
        return $this->belongsTo(Resident::class, 'spouse_id');
    }

    /** Lola/lolo — the parents of this resident's parents, deduplicated. */
    public function grandparents()
    {
        $this->loadMissing('parents.parents');

        // A step-mother's parents are not this child's grandparents, and the
        // child's real ones do not stop being so because a parent remarried.
        return $this->bloodParents()
            ->flatMap(fn ($parent) => $parent->bloodParents())
            ->unique('id')
            ->values();
    }

    /**
     * Everyone who shares at least one parent, excluding this resident.
     *
     * Blood on both sides of the walk: through a real parent, to their real
     * children. A step-parent's own children share no parent with this
     * resident, and calling them brothers and sisters would be inventing a
     * family the register was never told about.
     */
    public function siblings()
    {
        $this->loadMissing('parents.children');

        return $this->bloodParents()
            ->flatMap(fn ($parent) => $parent->bloodChildren())
            ->reject(fn ($sibling) => $sibling->id === $this->id)
            ->unique('id')
            ->values();
    }

    /**
     * Tita / tito — the siblings of this resident's parents.
     *
     * Another step outward on the same join. Nothing here is stored: an uncle
     * is simply someone who shares a parent with your parent, so the moment
     * the barangay records a grandparent, a whole side of the family appears
     * on its own.
     */
    public function auntsAndUncles()
    {
        $this->loadMissing('parents.parents.children');

        // Rewrapped as an Eloquent collection: flatMap drops to a plain one,
        // and cousins() needs loadMissing() on the result.
        return new EloquentCollection(
            $this->bloodParents()
                ->flatMap(fn ($parent) => $parent->siblings())
                ->unique('id')
                ->values()
                ->all()
        );
    }

    /** Pinsan — the children of this resident's aunts and uncles. */
    public function cousins()
    {
        $relatives = $this->auntsAndUncles();

        if ($relatives->isEmpty()) {
            return $relatives; // an empty collection of the right type
        }

        $relatives->loadMissing('children');

        return new EloquentCollection(
            $relatives
                ->flatMap(fn ($relative) => $relative->bloodChildren())
                ->unique('id')
                // Guards against a mis-recorded loop putting someone in their
                // own cousin list.
                ->reject(fn ($cousin) => $cousin->id === $this->id)
                ->values()
                ->all()
        );
    }

    /** Every marriage this resident has been in, current or ended. */
    public function marriages()
    {
        return ResidentMarriage::involving($this->id)->orderByDesc('id');
    }

    /** The one that has not ended, if any. */
    public function currentMarriage(): ?ResidentMarriage
    {
        return ResidentMarriage::involving($this->id)->open()->latest('id')->first();
    }

    /**
     * Marries two residents to each other.
     *
     * Marriage is symmetric, so writing only one side would leave the other
     * person single in the registry — and it is a HISTORY, so the row opened
     * here is what survives when the marriage later ends and one of them
     * marries again.
     */
    public function marryTo(
        Resident $spouse,
        ?string $marriedOn = null,
        string $unionType = 'Married'
    ): ResidentMarriage {
        $this->forceFill(['spouse_id' => $spouse->id])->save();
        $spouse->forceFill(['spouse_id' => $this->id])->save();

        return ResidentMarriage::create([
            'resident_id' => $this->id,
            'spouse_id' => $spouse->id,
            'union_type' => $unionType,
            'married_on' => $marriedOn,
            'recorded_by' => auth()->id(),
        ]);
    }
    public function getFullNameAttribute()
    {
        // Joined from the parts that exist: a missing middle name or suffix must
        // not leave a double space in the middle of the name.
        return implode(' ', array_filter([
            $this->first_name,
            $this->middleInitial(),
            $this->last_name,
            $this->suffix,
        ], fn ($part) => trim((string) $part) !== ''));
    }

    /**
     * The middle name as it should be printed.
     *
     * One letter is an INITIAL and takes a full stop — "A." — which is what
     * makes it read as an initial rather than as somebody whose middle name
     * is the letter A. Anything longer is a name and is left exactly as
     * recorded, because "Santos." is not a thing. A stop already there is
     * left alone rather than doubled.
     */
    public function middleInitial(): string
    {
        $middle = trim((string) $this->middle_name);

        if ($middle === '' || str_ends_with($middle, '.')) {
            return $middle;
        }

        return mb_strlen($middle) === 1 ? $middle . '.' : $middle;
    }
}
