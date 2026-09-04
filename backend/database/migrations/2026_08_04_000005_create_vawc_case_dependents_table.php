<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Children and dependents involved in a VAWC case, linked to their registry
 * records rather than typed as prose.
 *
 * A name in a text box cannot be looked up, cannot be cross-checked against a
 * household, and cannot be carried into a referral. Protective services need
 * the actual person, so the desk picks them from the registry.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vawc_case_dependents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('vawc_case_id');
            $table->unsignedBigInteger('resident_id');
            $table->timestamps();

            $table->foreign('vawc_case_id')->references('id')->on('vawc_cases')->onDelete('cascade');
            $table->foreign('resident_id')->references('id')->on('residents')->onDelete('cascade');
            // One row per child per case.
            $table->unique(['vawc_case_id', 'resident_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vawc_case_dependents');
    }
};
