<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('vawc_cases', function (Blueprint $table) {
            $table->id();
            $table->string('case_code')->unique();
            $table->unsignedBigInteger('survivor_id');
            $table->enum('violence_type', ['Physical', 'Psychological', 'Economic', 'Sexual', 'Mixed']);
            $table->string('relationship_to_offender')->nullable();
            $table->boolean('children_involved')->default(false);
            $table->integer('children_count')->default(0);
            $table->text('immediate_needs')->nullable();
            $table->integer('previous_incidents_count')->default(0);
            $table->unsignedBigInteger('assigned_vawc_officer')->nullable();
            $table->enum('status', ['Active', 'Closed', 'Archived'])->default('Active');
            $table->text('confidential_notes')->nullable();
            $table->date('report_date');
            $table->dateTime('closed_at')->nullable();
            $table->timestamps();
            
            $table->foreign('survivor_id')->references('id')->on('residents')->onDelete('cascade');
            $table->foreign('assigned_vawc_officer')->references('id')->on('users')->onDelete('set null');
            $table->index('case_code');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vawc_cases');
    }
};
