{{-- Shared shell for barangay emails. Table-based and inline-styled, because
     that is what mail clients reliably render. --}}
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#F4F4F7;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1F2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="background:#723EC3;padding:24px 28px;color:#FFFFFF;">
        <div style="font-size:18px;font-weight:700;letter-spacing:.3px;">BARANGAY NATUMOLAN</div>
        <div style="font-size:12px;opacity:.85;margin-top:2px;">Tagoloan &middot; Misamis Oriental</div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;font-size:14px;line-height:1.7;">
        @yield('body')
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 24px;font-size:11px;color:#6B7280;border-top:1px solid #E5E7EB;">
        This is an automated message from the Barangay Natumolan Management
        Information System. Please do not reply to it. For help, visit the
        Barangay Main Office (Mon&ndash;Fri, 8:00&nbsp;AM&ndash;5:00&nbsp;PM).
      </td>
    </tr>
  </table>
</body>
</html>
