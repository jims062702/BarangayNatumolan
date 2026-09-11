<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\CertificateController;
use App\Http\Controllers\Api\ServiceRequestController;
use App\Models\CertificateClearance;
use App\Support\CertificateCatalogue;
use App\Models\ServiceRequest;
use Illuminate\Console\Command;

/**
 * Raises the certificate behind a request that never got one.
 *
 * Every certificate-type request made through the system now raises its
 * document the moment it is filed — online or at the counter. Requests
 * recorded before that, or written straight into the database by the seeder,
 * have no certificate behind them.
 *
 * That was harmless while the clerk had a Service Requests screen to find
 * them on. With the front desk working from Certificates & Clearances alone,
 * a request with no certificate is a request nobody can see — so they are
 * given the document the current rule says they should already have.
 *
 * Only types that produce a document are touched. A request for something
 * else stays as it is: it has no certificate because there is no certificate
 * to have, and inventing one would put a blank document on the clerk's desk.
 *
 * Idempotent. Run it twice and the second pass finds nothing.
 */
class BackfillRequestCertificates extends Command
{
    protected $signature = 'requests:backfill-certificates {--dry-run : List what would be raised, and write nothing}';

    protected $description = 'Raise the missing certificate behind certificate-type service requests';

    /**
     * What the document's state is, given the request's.
     *
     * Two vocabularies, because they describe different things: a request is
     * a job on a desk, a certificate is a piece of paper on its way to
     * somebody. The pairing here is the one the existing records already use.
     */
    private const STATUS = [
        'Pending' => 'Pending',
        'In Progress' => 'Processing',
        'Approved' => 'Ready to Claim',
        'Completed' => 'Released',
        'Rejected' => 'Cancelled',
    ];

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');

        $missing = ServiceRequest::whereDoesntHave('certificate')
            ->whereNotNull('resident_id')
            ->orderBy('id')
            ->get();

        $raised = 0;
        $skipped = 0;

        foreach ($missing as $request) {
            $type = ServiceRequestController::CERTIFICATE_TYPES[$request->service_type] ?? null;

            if (!$type) {
                $skipped++;
                $this->line("  skip  {$request->request_number}  {$request->service_type} — produces no document");
                continue;
            }

            $status = self::STATUS[$request->status] ?? 'Pending';

            $this->line("  raise {$request->request_number}  {$request->service_type} → {$type} ({$status})");

            if ($dry) {
                $raised++;
                continue;
            }

            CertificateClearance::create([
                'certificate_number' => CertificateClearance::nextCertificateNumber(),
                'reference_number' => CertificateClearance::nextReferenceNumber(),
                'resident_id' => $request->resident_id,
                'service_request_id' => $request->id,
                'certificate_type' => $type,
                'purpose' => $request->purpose ?: $type,
                'fee_amount' => CertificateCatalogue::feeFor($type, $request->purpose) ?? 0,
                'is_exempt' => false,
                'status' => $status,
            ]);

            $raised++;
        }

        $this->newLine();
        $this->info($dry
            ? "{$raised} certificate(s) would be raised, {$skipped} left alone. Nothing was written."
            : "{$raised} certificate(s) raised, {$skipped} left alone.");

        return self::SUCCESS;
    }
}
