<?php

namespace App\Http\Controllers\Api;

use App\Support\ChangeLog;

/**
 * "Has anything changed?" — the cheapest question in the system.
 *
 * Every page used to answer this by fetching its whole list on a timer, which
 * is why a work queue waited twelve seconds and the portal thirty. This is
 * one read of a table with a dozen rows, so it can be asked every second, and
 * the expensive fetch happens only when the answer is yes.
 *
 * It deliberately returns NO data — only counters. Anything sensitive stays
 * behind the endpoint that already guards it, which is what lets one cheap
 * route serve every desk without a gate of its own beyond being signed in.
 */
class PulseController extends BaseController
{
    public function __invoke()
    {
        return $this->success(ChangeLog::versions(), 'Pulse');
    }
}
