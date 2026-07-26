<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vawc_access_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('vawc_case_id');
            $table->unsignedBigInteger('user_id');
            $table->string('action'); // viewed, created, updated, referral_added, document_added, ...
            $table->string('detail')->nullable();
            $table->timestamps();

            $table->foreign('vawc_case_id')->references('id')->on('vawc_cases')->onDelete('cascade');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->index(['vawc_case_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vawc_access_logs');
    }
};
