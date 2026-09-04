<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One RBIM baseline census form.
 *
 * Household-level answers (section H) live here; the member grid lives in
 * RbimCensusMember, one row per line on the paper.
 */
class RbimCensus extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_institutional' => 'boolean',
            'consent_given' => 'boolean',
            'date_encoded' => 'date',
            'submitted_at' => 'datetime',
            'reviewed_at' => 'datetime',
        ];
    }

    /** Read in line order — the way the paper is read. */
    public function members(): HasMany
    {
        return $this->hasMany(RbimCensusMember::class)->orderBy('line_no');
    }

    /** The household this form was matched to, once somebody decided. */
    public function household(): BelongsTo
    {
        return $this->belongsTo(Household::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    /* ------------------------------------------------------------------ */
    /* Section H code lists                                                */
    /* ------------------------------------------------------------------ */

    /** Q45/Q46 — how the housing unit and the lot are held. */
    public const TENURES = [
        1 => 'Rent-free without consent of owner',
        2 => 'Rent-free with consent of owner',
        3 => 'Rented',
        4 => 'Owned/being amortized',
    ];

    /** Q47 — fuel for lighting. */
    public const LIGHTING_FUELS = [
        0 => 'None', 1 => 'Oil (vegetable, animal, others)',
        2 => 'Liquefied petroleum gas (LPG)', 3 => 'Kerosene (gaas)',
        4 => 'Electricity', 5 => 'Others',
    ];

    /** Q48 — fuel used most of the time for cooking. */
    public const COOKING_FUELS = [
        0 => 'None', 1 => 'Wood', 2 => 'Charcoal',
        3 => 'Liquefied petroleum gas (LPG)', 4 => 'Kerosene (gaas)',
        5 => 'Electricity', 6 => 'Others',
    ];

    /** Q49 — main source of drinking water. */
    public const WATER_SOURCES = [
        1 => 'Lake, river, rain, others',
        2 => 'Dug well',
        3 => 'Unprotected spring',
        4 => 'Protected spring',
        5 => 'Peddler',
        6 => 'Tubed/Piped shallow well',
        7 => 'Shared, tubed/piped deep well',
        8 => 'Own use, tubed/piped deep well',
        9 => 'Shared, faucet community water system',
        10 => 'Own use, faucet community water system',
        11 => 'Bottled water',
        12 => 'Others',
    ];

    /** Q50a — how kitchen waste is usually disposed of. */
    public const GARBAGE_DISPOSAL = [
        1 => 'Feeding to animals', 2 => 'Burying', 3 => 'Composting',
        4 => 'Burning', 5 => 'Dumping individual pit (not burned)',
        6 => 'Picked-up by garbage truck',
    ];

    /** Q51 — toilet facility. */
    public const TOILETS = [
        0 => 'None', 1 => 'Open pit', 2 => 'Close pit',
        3 => 'Water-sealed, other depository, shared',
        4 => 'Water-sealed, other depository, exclusive',
        5 => 'Water-sealed, sewer septic tank, shared',
        6 => 'Water-sealed, sewer septic tank, exclusive',
        7 => 'Others',
    ];

    /** Q52 — observed, not asked. */
    public const BUILDING_TYPES = [
        1 => 'Single house', 2 => 'Duplex',
        3 => 'Multi-unit residential (three units or more)',
        4 => 'Commercial/industrial/agricultural',
        5 => 'Institutional living quarter (hotel, hospital)',
        6 => 'Other housing units (boat, cave, others)',
    ];

    /** Q53 — observed, not asked. */
    public const OUTER_WALLS = [
        0 => 'No walls', 1 => 'Makeshift/salvaged/improvised materials',
        2 => 'Glass', 3 => 'Asbestos', 4 => 'Bamboo/Sawali/Cogon/Nipa',
        5 => 'Galvanized iron/aluminum',
        6 => 'Half concrete/brick/stone and half wood',
        7 => 'Wood', 8 => 'Concrete/brick/stone', 9 => 'Others',
    ];

    public const YES_NO = [1 => 'Yes', 2 => 'No'];

    /** Everything section H needs to render. */
    public static function codeLists(): array
    {
        return [
            'tenures' => self::TENURES,
            'lighting_fuels' => self::LIGHTING_FUELS,
            'cooking_fuels' => self::COOKING_FUELS,
            'water_sources' => self::WATER_SOURCES,
            'garbage_disposal' => self::GARBAGE_DISPOSAL,
            'toilets' => self::TOILETS,
            'building_types' => self::BUILDING_TYPES,
            'outer_walls' => self::OUTER_WALLS,
            'yes_no' => self::YES_NO,
        ];
    }

    /**
     * The next form number for the year.
     *
     * One above the highest ever issued — the same rule the registry uses,
     * and for the same reason: a deleted form must not hand its number to
     * the next one.
     */
    public static function nextNumber(): string
    {
        return \App\Support\SequenceNumber::next(
            'rbim_censuses',
            'census_no',
            'RBIM-' . date('Y') . '-',
            4
        );
    }
}
