<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CertificateController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\HeroSlideController;
use App\Http\Controllers\Api\LuponController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\OfficialController;
use App\Http\Controllers\Api\PopulationController;
use App\Http\Controllers\Api\PortalController;
use App\Http\Controllers\Api\PublicController;
use App\Http\Controllers\Api\ResidentController;
use App\Http\Controllers\Api\ServiceGuideController;
use App\Http\Controllers\Api\ServiceRequestController;
use App\Http\Controllers\Api\VawcController;

/*
|--------------------------------------------------------------------------
| Public — no authentication
|--------------------------------------------------------------------------
| Accounts are BPO/Admin-created; there is intentionally NO public register.
*/
Route::post('auth/login', [AuthController::class, 'login']);

Route::get('services', [ServiceRequestController::class, 'getAvailableServices']);
Route::get('contact', [ServiceRequestController::class, 'getContactInfo']);
Route::get('announcements', [PublicController::class, 'announcements']);
Route::get('announcements/{announcement}', [PublicController::class, 'announcement']);
Route::get('hero-slides', [PublicController::class, 'heroSlides']);
Route::get('officials', [PublicController::class, 'officials']);
Route::get('stats', [PublicController::class, 'stats']);
Route::get('verify/{referenceNumber}', [PublicController::class, 'verifyCertificate']);
Route::post('assistant/inquiry', [PublicController::class, 'assistantInquiry']);
Route::post('contact', [PublicController::class, 'contact'])->middleware('throttle:5,1');

/*
|--------------------------------------------------------------------------
| Authenticated
|--------------------------------------------------------------------------
*/
Route::middleware('auth:sanctum')->group(function () {

    // Account endpoints (staff + residents)
    Route::prefix('auth')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
        Route::put('profile', [AuthController::class, 'updateProfile']);
        Route::post('change-password', [AuthController::class, 'changePassword']);
        Route::post('refresh-token', [AuthController::class, 'refreshToken']);
    });

    // In-system notifications (staff + residents, self-scoped)
    Route::get('notifications', [NotificationController::class, 'index']);
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('notifications/{notification}/read', [NotificationController::class, 'markRead']);

    /*
    |----------------------------------------------------------------------
    | Resident portal (role Resident, linked resident record required)
    |----------------------------------------------------------------------
    */
    Route::prefix('portal')->middleware('office:ResidentRole')->group(function () {
        Route::get('dashboard', [PortalController::class, 'dashboard']);
        Route::get('requests', [PortalController::class, 'myRequests']);
        Route::post('requests', [PortalController::class, 'createRequest']);
        Route::get('requests/{serviceRequest}', [PortalController::class, 'showRequest']);
        Route::get('appointments', [PortalController::class, 'myAppointments']);
        Route::post('appointments', [PortalController::class, 'bookAppointment']);
        Route::post('appointments/{appointment}/cancel', [PortalController::class, 'cancelAppointment']);
        Route::get('certificates', [PortalController::class, 'myCertificates']);
        Route::get('profile', [PortalController::class, 'profile']);
    });

    /*
    |----------------------------------------------------------------------
    | Staff-only area (any office role; residents blocked)
    |----------------------------------------------------------------------
    */
    Route::middleware('staff')->group(function () {

        // Dashboards & notifications (all staff, incl. clerk)
        Route::get('dashboard/summary', [DashboardController::class, 'getSummary']);
        Route::get('dashboard/pending-items', [DashboardController::class, 'getPendingItems']);
        Route::get('reports/service-statistics', [DashboardController::class, 'getServiceStatistics']);

        // Residents registry: read/search open to staff (needed for the
        // certificate picker); writes are Population-only (enforced in the
        // controller). The clerk may look up residents but not edit them.
        Route::get('residents/search', [ResidentController::class, 'search']);
        Route::get('residents/household-options', [ResidentController::class, 'householdOptions']);
        Route::apiResource('residents', ResidentController::class);
        Route::post('residents/{resident}/sectors', [ResidentController::class, 'addSector']);
        Route::get('population/verify-resident', [PopulationController::class, 'verifyResident']);

        // Certificates & clearances (the Clerk's core responsibility)
        Route::get('certificates/fee-schedule', [CertificateController::class, 'feeSchedule']);
        Route::apiResource('certificates', CertificateController::class)
            ->only(['index', 'store', 'show']);
        Route::post('certificates/{certificate}/approve', [CertificateController::class, 'approve']);
        Route::post('certificates/{certificate}/reject', [CertificateController::class, 'reject']);
        Route::post('certificates/{certificate}/mark-printed', [CertificateController::class, 'markPrinted']);
        Route::post('certificates/{certificate}/release', [CertificateController::class, 'release']);
        Route::post('certificates/{certificate}/reprint', [CertificateController::class, 'reprint']);

        // Requests & queue — the Clerk's front desk (walk-in + online intake).
        // Walk-ins start In Progress; online requests arrive Pending and the
        // clerk moves them along. PB decisions happen on the certificate.
        Route::apiResource('service-requests', ServiceRequestController::class);
        Route::get('service-requests/{serviceRequest}/status', [ServiceRequestController::class, 'getStatus']);

        /*
        | Everything below is off-limits to the Clerk (requests & certificates only).
        */
        Route::middleware('deny_role:Clerk')->group(function () {
            // Administrative records
            Route::get('administrative-records', [ResidentController::class, 'getAdministrativeRecords']);
            Route::post('administrative-records', [ResidentController::class, 'createAdministrativeRecord']);

            // Appointments
            Route::apiResource('appointments', AppointmentController::class);
            Route::post('appointments/{appointment}/confirm', [AppointmentController::class, 'confirm']);
            Route::post('appointments/{appointment}/cancel', [AppointmentController::class, 'cancel']);

            // AI service-guide knowledge base (Main Office / PB / Admin)
            Route::prefix('manage')->middleware('office:Main Office,PB,AdminRole')->group(function () {
                Route::apiResource('service-guides', ServiceGuideController::class)
                    ->only(['index', 'store', 'update', 'destroy']);
            });
        });

        /*
        | Sangguniang Kabataan (SK) — manages the public landing content:
        | home pictures, news & announcements, and officials.
        */
        Route::prefix('sk')->middleware('office:SK,PB,AdminRole')->group(function () {
            Route::post('hero-slides/reorder', [HeroSlideController::class, 'reorder']);
            Route::apiResource('hero-slides', HeroSlideController::class)
                ->only(['index', 'store', 'update', 'destroy']);
            Route::apiResource('officials', OfficialController::class)
                ->only(['index', 'store', 'update', 'destroy']);
            Route::post('announcements/reorder', [AnnouncementController::class, 'reorder']);
            Route::apiResource('announcements', AnnouncementController::class)
                ->only(['index', 'store', 'update', 'destroy']);
        });

        /*
        | VAWC Desk — STRICTLY isolated: office VAWC only.
        */
        Route::prefix('vawc')->middleware('office:VAWC')->group(function () {
            Route::get('cases', [VawcController::class, 'index']);
            Route::post('cases', [VawcController::class, 'store']);
            Route::get('cases/{case}', [VawcController::class, 'show']);
            Route::put('cases/{case}', [VawcController::class, 'update']);
            Route::post('cases/{case}/incidents', [VawcController::class, 'addIncident']);
            Route::post('cases/{case}/referrals', [VawcController::class, 'createReferral']);
            Route::put('cases/{case}/referrals/{referral}', [VawcController::class, 'updateReferral']);
            Route::post('cases/{case}/followup', [VawcController::class, 'recordFollowup']);
            Route::get('cases/{case}/documents', [VawcController::class, 'getDocuments']);
            Route::post('cases/{case}/documents', [VawcController::class, 'addDocument']);
            Route::get('cases/{case}/access-logs', [VawcController::class, 'accessLogs']);
            Route::get('reports/statistics', [VawcController::class, 'getStatistics']);
        });

        /*
        | Lupon Tagapamayapa — Lupon office + Punong Barangay.
        */
        Route::prefix('lupon')->middleware('office:Lupon,PB')->group(function () {
            Route::get('deadlines', [LuponController::class, 'deadlines']);
            Route::get('reports/monthly-transmittal', [LuponController::class, 'generateMonthlyReport']);
            Route::get('cases', [LuponController::class, 'index']);
            Route::post('cases', [LuponController::class, 'store']);
            Route::get('cases/{case}', [LuponController::class, 'show']);
            Route::post('cases/{case}/screen-jurisdiction', [LuponController::class, 'screenJurisdiction']);
            Route::post('cases/{case}/hearings', [LuponController::class, 'scheduleHearing']);
            Route::put('cases/{case}/hearings/{hearing}', [LuponController::class, 'recordHearingOutcome']);
            Route::post('cases/{case}/mediation', [LuponController::class, 'recordMediation']);
            Route::post('cases/{case}/conciliation', [LuponController::class, 'recordConciliation']);
            Route::post('cases/{case}/settlement', [LuponController::class, 'recordSettlement']);
            Route::post('cases/{case}/settlement-action', [LuponController::class, 'settlementAction']);
            Route::get('cases/{case}/forms', [LuponController::class, 'generateForms']);
        });

        /*
        | Population Office (BPO) — owns the registry & portal accounts.
        */
        Route::prefix('population')->middleware('office:Population,AdminRole')->group(function () {
            Route::get('households', [PopulationController::class, 'listHouseholds']);
            Route::post('households', [PopulationController::class, 'createHousehold']);
            Route::get('events', [PopulationController::class, 'listEvents']);
            Route::post('events', [PopulationController::class, 'recordPopulationEvent']);
            Route::put('events/{event}/verify', [PopulationController::class, 'verifyEvent']);
            Route::get('sectors/{sector}', [PopulationController::class, 'getSectorList']);
            Route::get('analytics', [PopulationController::class, 'getAnalytics']);
            Route::get('reports/sectoral', [PopulationController::class, 'getSectoralReport']);
            Route::post('residents/{resident}/create-account', [PopulationController::class, 'createResidentAccount']);
            Route::post('residents/{resident}/change-password', [PopulationController::class, 'changeResidentPassword']);
            Route::get('accounts', [PopulationController::class, 'listResidentAccounts']);
            Route::post('accounts/{user}/toggle', [PopulationController::class, 'toggleResidentAccount']);
        });

        /*
        | Barangay Health Station — health personnel only.
        */
        Route::prefix('health')->middleware('office:Health Station')->group(function () {
            Route::get('visits', [HealthController::class, 'listVisits']);
            Route::post('visits', [HealthController::class, 'createVisit']);
            Route::get('patients/{resident}/history', [HealthController::class, 'getPatientHistory']);
            Route::get('immunization', [HealthController::class, 'listImmunizations']);
            Route::post('immunization', [HealthController::class, 'recordImmunization']);
            Route::get('immunization-status/{resident}', [HealthController::class, 'getImmunizationStatus']);
            Route::get('maternal-health', [HealthController::class, 'listMaternal']);
            Route::post('maternal-health', [HealthController::class, 'recordMaternalHealth']);
            Route::get('child-health', [HealthController::class, 'listChildHealth']);
            Route::post('child-health', [HealthController::class, 'recordChildHealth']);
            Route::get('reports/coverage', [HealthController::class, 'getCoverageReport']);
        });

        /*
        | System Administration — staff account management (Admin only)
        */
        Route::prefix('admin')->middleware('office:AdminRole')->group(function () {
            Route::get('users', [AdminUserController::class, 'index']);
            Route::post('users', [AdminUserController::class, 'store']);
            Route::put('users/{user}', [AdminUserController::class, 'update']);
        });
    });
});
