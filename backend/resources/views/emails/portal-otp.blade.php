@extends('emails._layout')

@section('body')
  <p style="margin:0 0 16px;">Kumusta, <strong>{{ $user->name }}</strong>!</p>

  <p style="margin:0 0 16px;">
    Use this code to activate your Barangay Natumolan portal account:
  </p>

  <div style="background:#F4F4F7;border-radius:12px;padding:20px;text-align:center;margin:0 0 16px;">
    <div style="font-size:32px;font-weight:700;letter-spacing:10px;font-family:Consolas,monospace;color:#723EC3;">{{ $code }}</div>
    <div style="font-size:12px;color:#6B7280;margin-top:8px;">
      Expires in {{ \App\Models\User::OTP_TTL_MINUTES }} minutes.
    </div>
  </div>

  <p style="margin:0 0 16px;">
    Type it on the sign-in page to finish activating your account.
  </p>

  <p style="margin:0;color:#6B7280;">
    If you did not try to sign in, you can ignore this email &mdash; and please
    tell the Barangay Population Office, since someone else may have your
    password.
  </p>
@endsection
