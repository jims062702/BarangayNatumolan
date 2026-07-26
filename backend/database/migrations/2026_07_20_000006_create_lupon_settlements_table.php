<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lupon_settlements', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('lupon_case_id')->unique();
            $table->enum('settlement_type', ['Amicable Settlement', 'Arbitration Award'])->default('Amicable Settlement');
            $table->text('terms');
            $table->date('date_agreed');
            // KP Law: settlement becomes final unless repudiated within 10 days.
            $table->date('repudiation_deadline');
            $table->enum('status', ['Within Repudiation Period', 'Final', 'Repudiated', 'Complied', 'Not Complied', 'Executed'])->default('Within Repudiation Period');
            $table->date('compliance_deadline')->nullable();
            $table->text('compliance_notes')->nullable();
            $table->boolean('cfa_issued')->default(false); // Certificate to File Action
            $table->dateTime('cfa_issued_at')->nullable();
            $table->boolean('cba_issued')->default(false); // Certificate to Bar Action
            $table->dateTime('cba_issued_at')->nullable();
            $table->dateTime('closed_at')->nullable();
            $table->unsignedBigInteger('recorded_by')->nullable();
            $table->timestamps();

            $table->foreign('lupon_case_id')->references('id')->on('lupon_cases')->onDelete('cascade');
            $table->foreign('recorded_by')->references('id')->on('users')->onDelete('set null');
            $table->index('repudiation_deadline');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lupon_settlements');
    }
};
