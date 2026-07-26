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
        Schema::create('certificates_clearances', function (Blueprint $table) {
            $table->id();
            $table->string('certificate_number')->unique();
            $table->unsignedBigInteger('resident_id');
            $table->unsignedBigInteger('service_request_id');
            $table->enum('certificate_type', ['Barangay Clearance', 'Certificate of Residency', 'Certificate of Indigency', 'First-Time Jobseeker', 'Certificate of Low or No Income', 'Business Barangay Clearance', 'Good Moral Character', 'Other'])->default('Barangay Clearance');
            $table->text('purpose')->nullable();
            $table->decimal('fee_amount', 8, 2)->default(0);
            $table->boolean('is_exempt')->default(false);
            $table->string('exemption_reason')->nullable();
            $table->enum('status', ['Application', 'Verification', 'Approved', 'Printed', 'Released', 'Rejected'])->default('Application');
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->unsignedBigInteger('released_by')->nullable();
            $table->dateTime('approved_at')->nullable();
            $table->dateTime('released_at')->nullable();
            $table->string('qr_code')->nullable();
            $table->string('reference_number')->unique();
            $table->integer('reprint_count')->default(0);
            $table->timestamps();
            
            $table->foreign('resident_id')->references('id')->on('residents')->onDelete('cascade');
            $table->foreign('service_request_id')->references('id')->on('service_requests')->onDelete('cascade');
            $table->foreign('approved_by')->references('id')->on('users')->onDelete('set null');
            $table->foreign('released_by')->references('id')->on('users')->onDelete('set null');
            $table->index('certificate_number');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('certificates_clearances');
    }
};
