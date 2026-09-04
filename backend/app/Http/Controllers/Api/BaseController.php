<?php

namespace App\Http\Controllers\Api;

use Illuminate\Routing\Controller;

class BaseController extends Controller
{
    /*
    |--------------------------------------------------------------------------
    | Date boundaries for validating what a user typed
    |--------------------------------------------------------------------------
    | The app runs in UTC (config/app.php) but the forms submit Philippine
    | wall-clock time, exactly as the clerk reads it off the wall. Validating
    | that against Laravel's `now` compares 14:30 Manila with 06:30 UTC, which
    | goes wrong in BOTH directions:
    |
    |   before_or_equal:now  rejected "this afternoon" as being in the future,
    |                        so a VAWC intake or a mediation could not be
    |                        recorded at all after 8am;
    |   after:now            accepted times up to 8 hours in the PAST, so a
    |                        hearing or appointment could be booked backwards.
    |
    | Compare against Manila's clock instead, in the same naive frame the form
    | sent. Use these instead of the literal `now` / `today` in date rules.
    */
    protected const MANILA = 'Asia/Manila';

    /** "Y-m-d H:i:s" for the current Philippine wall-clock time. */
    protected static function manilaNow(): string
    {
        return now(self::MANILA)->toDateTimeString();
    }

    /** "Y-m-d" for the current Philippine date. */
    protected static function manilaToday(): string
    {
        return now(self::MANILA)->toDateString();
    }

    /**
     * Send success response
     */
    public function success($data = null, $message = 'Success', $code = 200)
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => $data,
        ], $code);
    }

    /**
     * Send error response
     */
    public function error($message = 'Error', $code = 400, $errors = null)
    {
        return response()->json([
            'success' => false,
            'message' => $message,
            'errors' => $errors,
        ], $code);
    }

    /**
     * Send unauthorized response
     */
    public function unauthorized($message = 'Unauthorized')
    {
        return $this->error($message, 401);
    }

    /**
     * Send forbidden response
     */
    public function forbidden($message = 'Forbidden')
    {
        return $this->error($message, 403);
    }

    /**
     * Send not found response
     */
    public function notFound($message = 'Resource not found')
    {
        return $this->error($message, 404);
    }
}
