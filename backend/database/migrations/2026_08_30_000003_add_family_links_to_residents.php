<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Family tree for the registry.
 *
 * Parent/child is a many-to-many join (a child has up to two parents; a
 * parent has many children), which is also what makes grandparents free:
 * they are the parents of a resident's parents.
 *
 * Marriage is a single mutual pointer on the resident row — a person has at
 * most one current spouse — and it is what lets a child added to one parent
 * attach to the other automatically.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resident_parents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('child_id');
            $table->unsignedBigInteger('parent_id');
            // Mother / Father / Guardian — free text so step- and adoptive
            // arrangements can be recorded as the barangay words them.
            $table->string('relationship', 40)->nullable();
            $table->timestamps();

            $table->foreign('child_id')->references('id')->on('residents')->cascadeOnDelete();
            $table->foreign('parent_id')->references('id')->on('residents')->cascadeOnDelete();
            $table->unique(['child_id', 'parent_id']);
            $table->index('parent_id');
        });

        Schema::table('residents', function (Blueprint $table) {
            $table->unsignedBigInteger('spouse_id')->nullable()->after('civil_status');
            $table->foreign('spouse_id')->references('id')->on('residents')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('residents', function (Blueprint $table) {
            $table->dropForeign(['spouse_id']);
            $table->dropColumn('spouse_id');
        });
        Schema::dropIfExists('resident_parents');
    }
};
