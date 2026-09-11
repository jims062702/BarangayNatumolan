@extends('emails._layout')

@section('body')
  <p style="margin:0 0 16px;">Kumusta, <strong>{{ $user->name }}</strong>!</p>

  <p style="margin:0 0 16px;">
    Somebody asked to set a new password for your Barangay Natumolan account.
    Use this code to do it:
  </p>

  <div style="background:#F4F4F7;border-radius:12px;padding:20px;text-align:center;margin:0 0 16px;">
    <div style="font-size:32px;font-weight:700;letter-spacing:10px;font-family:Consolas,monospace;color:#723EC3;">{{ $code }}</div>
    <div style="font-size:12px;color:#6B7280;margin-top:8px;">
      Expires in {{ $minutes }} minutes.
    </div>
  </div>

  <p style="margin:0 0 16px;">
    Type it on the "Forgot password" page along with the new password you want.
  </p>

  {{--
    The reassurance matters more than it looks. Somebody who did not ask for
    this is being told their account is fine — and told where to go if it is
    not, in one sentence, by people they can walk to.
  --}}
  <p style="margin:0;color:#6B7280;">
    If you did not ask for this, nothing has changed and you can ignore this
    email &mdash; your current password still works. If it keeps happening,
    please tell the Barangay Population Office.
  </p>
@endsection
