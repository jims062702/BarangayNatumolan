@extends('emails._layout')

@section('body')
  <p style="margin:0 0 16px;">Kumusta, <strong>{{ $resident->first_name }}</strong>!</p>

  <p style="margin:0 0 16px;">
    You are now registered in the Barangay Natumolan resident registry, and a
    portal account has been created for you automatically. You can use it to
    request certificates online, book appointments, and follow your requests.
  </p>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F4F4F7;border-radius:12px;margin:0 0 16px;">
    <tr><td style="padding:16px 18px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#6B7280;">Email</div>
      <div style="font-size:15px;font-weight:600;margin:2px 0 12px;">{{ $resident->email }}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#6B7280;">Temporary password</div>
      <div style="font-size:15px;font-weight:600;font-family:Consolas,monospace;margin-top:2px;">{{ $password }}</div>
    </td></tr>
  </table>

  <p style="margin:0 0 16px;">
    Your password is your <strong>last name followed by your birthday</strong>
    in MMDDYY form &mdash; for example, someone named Cruz born on 27 June 2002
    would start with <code>Cruz062702</code>.
  </p>

  <p style="margin:0 0 16px;">
    The first time you sign in we will email you a <strong>6-digit verification
    code</strong>. Entering it activates your account and confirms this mailbox
    is yours. Please change your password once you are in.
  </p>
@endsection
