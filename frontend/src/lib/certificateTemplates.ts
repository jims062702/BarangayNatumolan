import seal from "../assets/logo/barangay-seal.jpg";

/**
 * The barangay's own certificate forms, as the system prints them.
 *
 * These are transcribed from the twelve Word templates the office actually
 * uses, and they replace a single generic paragraph that printed the same
 * sentence under every heading — and signed it with a name from the
 * demonstration data, "HON. RICARDO M. BALAGTAS", who does not exist.
 *
 * Where the paper template was broken, this says so at the point of the fix
 * rather than reproducing the break:
 *
 *   - the residency forms read "resides at the said place for how many
 *     years", because the blank was never cut into the sentence;
 *   - the death certification hardcoded "her son", which printed those two
 *     words for a father whose daughter came to the counter;
 *   - the marriage certification was one widow's document with her
 *     particulars typed in, down to the barangay in Bohol that issued her
 *     husband's death certificate;
 *   - the year 2026 was typed into all twelve.
 *
 * What is NOT changed is the barangay's wording. "he/she" stays "he/she"
 * even where the register knows perfectly well which — an official document
 * is not the place to improve somebody else's sentences.
 *
 * THE SEAL is the barangay's own, lifted out of word/media in their
 * CERTIFICATE OF RESIDENCY.docx. It is kept separate from the logo the navbar
 * uses, so the paper and the website can differ without either surprising the
 * other.
 */

export interface PrintableCertificate {
  certificate_number: string;
  reference_number: string;
  certificate_type: string;
  purpose: string | null;
  template_fields: Record<string, string> | null;
  photo_url?: string | null;
  resident?: {
    first_name?: string;
    middle_name?: string | null;
    last_name?: string;
    gender?: string | null;
    birthdate?: string | null;
    birth_place?: string | null;
    civil_status?: string | null;
    zone_purok?: string | null;
    address?: string | null;
    length_of_residence_years?: number | null;
  } | null;
}

export interface CouncilMember {
  position: string;
  name: string;
  /* What they are responsible for. The sidebar prints it under the name —
     it is the reason the panel is on the form at all. */
  committees?: string | null;
}

/*
 * The two Barangay Population Volunteers who check and verify a clearance.
 *
 * Named on the paper template and nowhere else — they are volunteers, not
 * officials, so the Officials roster has no room for them. Left here as one
 * line to edit rather than scattered through the markup, and worth turning
 * into data the day the barangay changes volunteers.
 */
const VERIFIERS = "JESSAH VETH V. CASTILLON/ABBESS KRISTEL P. PACALDO";

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

/** 1ST, 2ND, 3RD, 4TH — the form writes the day as an ordinal. */
function ordinal(day: number): string {
  if (day > 3 && day < 21) return `${day}TH`;
  switch (day % 10) {
    case 1: return `${day}ST`;
    case 2: return `${day}ND`;
    case 3: return `${day}RD`;
    default: return `${day}TH`;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** An answer the office gave, or the blank line the paper form would show. */
function filled(value: unknown, width = "220px"): string {
  const text = String(value ?? "").trim();

  return text
    ? `<u class="ans">${escapeHtml(text)}</u>`
    : `<span class="blank" style="min-width:${width}"></span>`;
}

function fullName(certificate: PrintableCertificate): string {
  const r = certificate.resident;

  return [r?.first_name, r?.middle_name, r?.last_name]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

function longDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * "Given this 9TH day of SEPTEMBER, 2026" — built from the issue date.
 *
 * The Word templates have 2026 typed into them. Left alone, every
 * certificate printed next year would have said 2026.
 */
function givenThis(verb: string, on: Date): string {
  return `${verb} this <u class="ans">${ordinal(on.getDate())}</u> day of
    <u class="ans">${MONTHS[on.getMonth()]}, ${on.getFullYear()}</u>`;
}

/* ------------------------------------------------------------------ *
 * The bodies                                                          *
 * ------------------------------------------------------------------ */

function body(
  certificate: PrintableCertificate,
  on: Date,
): { title: string; html: string; titleStyle?: "script" | "spaced" } {
  const f = certificate.template_fields ?? {};
  const r = certificate.resident;
  const name = fullName(certificate);
  const zone = r?.zone_purok ?? "";
  const place = "Natumolan, Tagoloan, Misamis Oriental";

  /* Years lived here. RBIM Q35 already asked, so the form does not. */
  const years = f.years_of_residence || r?.length_of_residence_years || "";

  switch (certificate.certificate_type) {
    case "Barangay Clearance":
      return {
        title: "BARANGAY CLEARANCE",
        html: `
          <p>This is to certify that ${filled(name, "330px")} of legal age
          and a bonafide resident of Zone ${filled(zone, "120px")} ${place}
          and as per record in this office shows that he/she has no criminal
          record filed against him/her nor pending case.</p>

          <p>This Clearance is issued upon the request of the above
          named-person for ${filled(certificate.purpose, "300px")}.</p>

          <p>${givenThis("Issued", on)} at Barangay ${place}.</p>`,
      };

    case "Barangay Clearance with Picture":
      return {
        title: "BARANGAY CLEARANCE",
        html: `
          <p class="center"><b>This is to certify that the person whose name,
          picture and signature appear hereon has requested a CLEARANCE from
          this office.</b></p>

          <table class="particulars">
            <tr>
              <td><b>NAME:</b> ${filled(name, "200px")}</td>
              <td><b>GENDER:</b> ${filled(r?.gender, "110px")}</td>
            </tr>
            <tr>
              <td><b>ADDRESS:</b> ${filled(r?.address || zone, "200px")}</td>
              <td><b>BIRTHDATE:</b> ${filled(longDate(r?.birthdate), "130px")}</td>
            </tr>
            <tr>
              <td><b>CIVIL STATUS:</b> ${filled(r?.civil_status, "110px")}</td>
              <td><b>PLACE OF BIRTH:</b> ${filled(r?.birth_place, "170px")}</td>
            </tr>
          </table>

          ${/*
            The photograph goes in the large box; the two thumbmark boxes are
            printed empty on purpose. A thumbmark is inked onto the paper at
            the counter, and a system that pretended to capture one would be
            claiming something it had not done.
          */ ""}
          <div class="marks">
            <div class="photo">${
              certificate.photo_url
                ? `<img src="${escapeHtml(certificate.photo_url)}" alt="" />`
                : ""
            }</div>
            <div class="thumbs">
              <div><div class="thumb"></div><span>LEFT</span></div>
              <div><div class="thumb"></div><span>RIGHT</span></div>
              <div class="sigbox"><div class="sigline"></div><span>SIGNATURE</span></div>
            </div>
          </div>

          <p>This is to certify further as per record in this office shows
          that he/she has no criminal record filed against him/her nor
          pending case.</p>

          <p>This CLEARANCE is issued upon the request of the above
          named-person for the purpose ${filled(certificate.purpose, "260px")}.</p>

          <p>${givenThis("Issued", on)} at Barangay ${place}.</p>`,
      };

    case "Business Barangay Clearance":
      /*
       * Composed here, not transcribed — the office did not supply a
       * business clearance template, but the ordinance prices thirty kinds
       * of business, so they plainly issue one. Written to the same pattern
       * as the personal clearance. Worth replacing with their own wording.
       */
      return {
        title: "BUSINESS BARANGAY CLEARANCE",
        html: `
          <p>This is to certify that the business known as
          ${filled(f.business_name, "300px")}, a
          ${filled(f.business_kind, "230px")}, owned and operated by
          ${filled(name, "280px")} of Zone ${filled(zone, "110px")} ${place},
          has no derogatory record filed against it in this office.</p>

          <p>This Clearance is issued upon the request of the above
          named-person for ${filled(certificate.purpose, "280px")}.</p>

          <p>${givenThis("Issued", on)} at Barangay ${place}.</p>`,
      };

    case "Certificate of Residency":
      return {
        title: "CERTIFICATE OF RESIDENCY",
        titleStyle: "script",
        html: `
          <p>THIS IS TO CERTIFY THAT ${filled(name, "330px")} of legal age
          and a resident of <b>Zone</b> ${filled(zone, "130px")} ${place}.</p>

          <p>This is to certify further that the above named-person resides
          at the said place for ${filled(years, "80px")} years.</p>

          <p>This certification is being issued upon the request of
          <b>the above name person</b> for ${filled(certificate.purpose, "290px")}.</p>

          <p>${givenThis("Given", on)} at ${place}.</p>`,
      };

    case "Certificate of Residency with Birth Details":
      return {
        title: "CERTIFICATE OF RESIDENCY",
        titleStyle: "script",
        html: `
          <p>THIS IS TO CERTIFY THAT ${filled(name, "320px")} a resident of
          <b>Zone</b> ${filled(zone, "130px")} ${place}.</p>

          <table class="details">
            <tr><td>Date of Birth</td><td>:</td><td>${filled(longDate(r?.birthdate), "260px")}</td></tr>
            <tr><td>Place of Birth</td><td>:</td><td>${filled(r?.birth_place, "260px")}</td></tr>
            <tr><td>Father&rsquo;s Name</td><td>:</td><td>${filled(f.father_name, "260px")}</td></tr>
            <tr><td>Mother&rsquo;s Name</td><td>:</td><td>${filled(f.mother_name, "260px")}</td></tr>
          </table>

          <p>This is to certify further that the above named-person resides
          at the said place for ${filled(years, "80px")} years.</p>

          <p>This certification is being issued upon the request of
          <b>the above name person</b> for ${filled(certificate.purpose, "290px")}.</p>

          <p>${givenThis("Given", on)} at ${place}.</p>`,
      };

    case "Certificate of Indigency":
      return {
        title: "CERTIFICATE OF INDIGENCY",
        titleStyle: "script",
        html: `
          <p>THIS IS TO CERTIFY THAT ${filled(name, "320px")} of legal age
          and bonafide resident of <b>Zone</b> ${filled(zone, "130px")} ${place}.</p>

          <p>This is to certify further that the above named-person is an
          indigent client in our barangay.</p>

          <p>This certification is being issued upon the request of the above
          name person seeking for ${filled(certificate.purpose, "280px")}.</p>

          <p>${givenThis("Given", on)} at ${place}.</p>`,
      };

    case "Certification of Death":
      return {
        title: "C E R T I F I C A T I O N",
        titleStyle: "spaced",
        html: `
          <p>THIS IS TO CERTIFY that the late ${filled(f.deceased_name, "290px")},
          ${filled(f.deceased_age, "50px")} years old and a resident of
          ${filled(f.deceased_address, "300px")}, died on
          ${filled(longDate(f.date_of_death) || f.date_of_death, "180px")} at
          ${filled(f.time_of_death, "180px")} at
          ${filled(f.place_of_death, "300px")}.</p>

          ${/*
            The relationship is asked for. The paper template says "upon the
            request of HER SON ____" in fixed type, so a father whose
            daughter came in was certified as having a son.
          */ ""}
          <p>This certification is being issued upon the request of
          ${filled(f.relationship_to_deceased, "150px")}
          ${filled(f.requested_by, "280px")} for DEATH CERTIFICATE.</p>

          <p>${givenThis("Given", on)} at ${place}.</p>`,
      };

    case "Certificate of Appearance":
      return {
        title: "CERTIFICATE OF APPEARANCE",
        html: `
          <p>THIS IS TO CERTIFY that subject person whose name is indicated
          below appeared in this Office:</p>

          <table class="details flush">
            <tr><td>Name</td><td>:</td><td>${filled(name, "320px")}</td></tr>
            <tr><td>Position</td><td>:</td><td>${filled(f.position, "320px")}</td></tr>
            <tr><td>Station</td><td>:</td><td>${filled(f.station, "320px")}</td></tr>
            <tr><td>Date/s Appeared</td><td>:</td><td>${filled(f.dates_appeared, "320px")}</td></tr>
            <tr><td>Purpose</td><td>:</td><td>${filled(certificate.purpose, "320px")}</td></tr>
          </table>

          <p>${givenThis("Issued", on)}.</p>`,
      };

    case "Certification of Common Law Partner":
      return {
        title: "C E R T I F I C A T I O N",
        titleStyle: "spaced",
        html: `
          <p>THIS IS TO CERTIFY THAT ${filled(name, "320px")} of legal age,
          and a bonafide resident of ${filled(zone, "120px")} ${place}.</p>

          <p>This is to certify further that the above named-person is the
          common law partner of ${filled(f.partner_name, "270px")} for almost
          ${filled(f.years_together, "90px")} years.</p>

          <p>This certification is being issued upon the request of the above
          named-person seeking for ${filled(certificate.purpose, "250px")}.</p>

          <p>${givenThis("Given", on)} at ${place}.</p>`,
      };

    case "Certification of Oneness of Name":
      return {
        title: "C E R T I F I C A T I O N",
        titleStyle: "spaced",
        html: `
          ${/*
            "In addition" — the paper template reads "The correct spelling is
            ____addition, they are one and the same person", which is not a
            sentence. Two words, and the only edit made to their wording
            anywhere in this file that was not a blank they had left out.
          */ ""}
          <p>The beneficiary&rsquo;s name on the payroll is
          ${filled(f.name_on_payroll, "290px")} which is incorrect. The
          correct spelling is ${filled(f.correct_name, "290px")}. In addition,
          they are one and the same person.</p>

          <p>This certification is being issued upon the request of the above
          named-person for ${filled(certificate.purpose, "230px")}.</p>

          <p>${givenThis("Given", on)} at ${place}.</p>`,
      };

    case "Certification for Marriage License": {
      /*
       * The attachments paragraph appears only when there IS a late spouse.
       * The paper template stated one unconditionally, naming a church
       * certificate and a barangay certificate from Aguining, Bohol — facts
       * belonging to one widow, printed for whoever came next.
       */
      const attachments = f.late_spouse_name || f.attached_documents
        ? `<p>Attached hereto are ${filled(f.attached_documents, "300px")},
           pertaining to the death of his/her late spouse
           ${filled(f.late_spouse_name, "250px")}.</p>`
        : "";

      return {
        title: "C E R T I F I C A T I O N",
        titleStyle: "spaced",
        html: `
          <p>THIS IS TO CERTIFY THAT ${filled(name, "300px")} of legal age,
          ${filled(f.civil_status_stated || r?.civil_status, "150px")} and a
          resident of ${filled(zone, "120px")} ${place}.</p>

          <p>This certification is being issued upon the request of the
          above-named person for his/her Marriage License application.</p>

          ${attachments}

          <p>${givenThis("Given", on)} at ${place}.</p>`,
      };
    }

    case "Barangay Construction Clearance":
      return {
        title: "C E R T I F I C A T I O N",
        titleStyle: "spaced",
        html: `
          <p><b>BARANGAY CONSTRUCTION CLEARANCE</b> is hereby granted to
          ${filled(f.applicant_name || name, "290px")} of Barangay ${place}
          after having verified and evaluated that the structure/covered by
          them application for
          ${/*
            A field. The paper template is titled for construction and then
            clears only ELECTRICAL INSTALLATION in fixed type, so a fence or
            an extension was certified as an electrical job.
          */ ""}
          <b>${filled(f.work_applied_for, "240px")}</b> is/are cleared from
          the following:</p>

          <ol class="clauses">
            <li>The structure is not affected by the road Development Plan of
            the Municipal Government authorization;</li>
            <li>The structure will not cause flooding;</li>
            <li>Structure will not block off the passageway of interior
            resident&rsquo;s outward to the existing road;</li>
            <li>That the structure and the activities to be performed within
            will not cause air or water pollution.</li>
          </ol>

          <p>This certification is being issued upon the request of the
          above-named company for whatever purpose it may serve best.</p>

          <p>${givenThis("Done", on)} at ${place}.</p>`,
      };

    case "First-Time Jobseeker":
      /*
       * Composed, like the business clearance — no template was supplied.
       * Free under RA 11261, which the document says out loud because that
       * is the law the applicant is claiming.
       */
      return {
        title: "FIRST-TIME JOBSEEKER CERTIFICATION",
        html: `
          <p>THIS IS TO CERTIFY THAT ${filled(name, "320px")} of legal age
          and a bonafide resident of <b>Zone</b> ${filled(zone, "130px")}
          ${place}, is a <b>first-time jobseeker</b> under Republic Act No.
          11261, the First Time Jobseekers Assistance Act.</p>

          <p>This certification is being issued upon the request of the above
          named-person for ${filled(certificate.purpose, "280px")}, and is
          <b>issued free of charge</b>. It is valid for one (1) year from the
          date below and may be availed of only once.</p>

          <p>${givenThis("Given", on)} at ${place}.</p>`,
      };

    case "Good Moral Character":
      /*
       * Composed, like the business clearance and the jobseeker form — the
       * office supplied no template for it, but the system already offered
       * it and residents can already ask for one, so it needed a body
       * rather than the blank line the generic case would have printed.
       */
      return {
        title: "CERTIFICATE OF GOOD MORAL CHARACTER",
        html: `
          <p>THIS IS TO CERTIFY THAT ${filled(name, "320px")} of legal age
          and a bonafide resident of <b>Zone</b> ${filled(zone, "130px")} ${place}.</p>

          <p>This is to certify further that the above named-person is of
          good moral character and standing in this community, and as per
          record in this office has no derogatory record filed against
          him/her nor pending case.</p>

          <p>This certification is being issued upon the request of the above
          named-person for ${filled(certificate.purpose, "280px")}.</p>

          <p>${givenThis("Given", on)} at ${place}.</p>`,
      };

    case "Certificate of Low or No Income":
      return {
        title: "CERTIFICATE OF LOW OR NO INCOME",
        html: `
          <p>THIS IS TO CERTIFY THAT ${filled(name, "320px")} of legal age
          and a bonafide resident of <b>Zone</b> ${filled(zone, "130px")} ${place}.</p>

          <p>This is to certify further that the above named-person has
          little or no regular source of income, as verified by this office.</p>

          <p>This certification is being issued upon the request of the above
          named-person for ${filled(certificate.purpose, "280px")}.</p>

          <p>${givenThis("Given", on)} at ${place}.</p>`,
      };

    default:
      /* "Other Certification" — the office writes the body itself. */
      return {
        title: "C E R T I F I C A T I O N",
        titleStyle: "spaced",
        html: `
          <p>THIS IS TO CERTIFY THAT ${filled(name, "320px")} of legal age
          and a bonafide resident of <b>Zone</b> ${filled(zone, "130px")} ${place}.</p>

          <p>${escapeHtml(f.body) || filled("", "100%")}</p>

          <p>This certification is being issued upon the request of the above
          named-person for ${filled(certificate.purpose, "280px")}.</p>

          <p>${givenThis("Given", on)} at ${place}.</p>`,
      };
  }
}

/* ------------------------------------------------------------------ *
 * The paper                                                           *
 * ------------------------------------------------------------------ */

/*
 * The seal's URL, escaped.
 *
 * Unescaped it was fine while the bundler emitted a tidy path and broke the
 * moment it emitted a data: URL instead — the quote inside ended the src
 * attribute early and spilled the rest of the image into the page as text,
 * above the letterhead. Caught by rendering it; no assertion about the
 * markup would have noticed.
 */
function sealUrl(): string {
  return escapeHtml(new URL(seal, window.location.origin).href);
}

/**
 * The four heading lines, centred on the page.
 *
 * `withSeal` is false on the Barangay Clearance, and that is not a tidying
 * choice: on the barangay's own form the seal sits at the top of the purple
 * council box down the left, and the heading beside it carries none. Drawing
 * one in both places put two seals on a page that has one.
 *
 * When the seal IS here it is taken out of the flow and laid over the left
 * margin, because the heading on their paper is centred on the SHEET. Laid
 * out beside the seal instead, the whole block sat visibly right of centre —
 * which is what "hindi naka align" was pointing at.
 */
function letterhead(office: string, withSeal: boolean): string {
  return `
    <div class="head">
      ${withSeal ? `<img class="seal" src="${sealUrl()}" alt="" />` : ""}
      <div class="headtext">
        <p>Republic of the Philippines</p>
        <p><b>PROVINCE OF MISAMIS ORIENTAL</b></p>
        <p>Municipality of <b>TAGOLOAN</b></p>
        <p>Barangay <b>NATUMOLAN</b></p>
        <p>-o0o-</p>
        <p class="office"><b>OFFICE OF THE ${office.toUpperCase()}</b></p>
      </div>
    </div>`;
}

/** The council down the left margin — only the Barangay Clearance has it. */
function sidebar(council: CouncilMember[]): string {
  const of = (position: string) =>
    council.filter((member) => member.position === position);

  const line = (member: CouncilMember, role: string) =>
    `<div class="member">
       <b>${escapeHtml(member.name)}</b>
       <span class="role">${role}</span>
       ${
         member.committees
           ? `<span class="cttee">${escapeHtml(member.committees)}</span>`
           : ""
       }
     </div>`;

  return `
    <aside class="council">
      ${/* At the top of the box, which is where their clearance has it. */ ""}
      <img class="council-seal" src="${sealUrl()}" alt="" />
      <h4>NATUMOLAN<br/>BRGY. COUNCIL</h4>
      ${of("Punong Barangay").map((m) => line(m, "Punong Barangay<br/>Over All Chairman")).join("")}
      <h5>BARANGAY KAGAWADS:</h5>
      ${of("Barangay Kagawad").map((m) => line(m, "Barangay Kagawad")).join("")}
      ${of("SK Chairperson").map((m) => line(m, "Barangay SK Chairperson")).join("")}
      ${of("Barangay Secretary").map((m) => line(m, "Barangay Secretary")).join("")}
      ${of("Barangay Treasurer").map((m) => line(m, "Barangay Treasurer")).join("")}
    </aside>`;
}

const STYLE = `
  /*
    Black. All of it.
    
    Violet and red went in here on the strength of a low-resolution
    screenshot that looked coloured. Their Word files say otherwise —
    document.xml carries no colour runs at all — so the certificates were
    being printed in colours the barangay has never used. The seal is the
    only colour on the sheet, and the purple rule around the council panel,
    which is a table border and is genuinely there.
  */
  @page { size: A4; margin: 12mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; color: #000; margin: 0; font-size: 12pt; }
  .sheet { display: flex; gap: 14px; }
  .council { width: 190px; border: 2px solid #5b21b6; padding: 8px 6px; text-align: center;
             font-size: 7.5pt; line-height: 1.25; flex: 0 0 190px; }
  .council h4 { font-size: 10pt; margin: 4px 0 8px; }
  .council h5 { font-size: 9pt; margin: 8px 0 4px; border-top: 1px solid #333;
                padding-top: 6px; }
  .member { margin-bottom: 8px; }
  .member b { display: block; font-size: 8pt; }
  .member span { display: block; }
  /* Smaller than the role, because it is two lines under half the names and
     the panel has to hold eleven people. */
  .member .cttee { font-size: 6.5pt; line-height: 1.2; }
  /* Same trap as the letterhead: the body's justify would win here too. */
  .council p, .council div { text-align: center; text-indent: 0; }
  .main { flex: 1; min-width: 0; }
  /*
    The heading is centred on the sheet and the seal is laid over the left
    margin, which is how the barangay's forms are set. Laying them out side
    by side instead centred the text in the LEFTOVER space and pushed the
    whole block right of the title beneath it.
  */
  .head { position: relative; min-height: 116px; margin-bottom: 6px;
          display: flex; flex-direction: column; justify-content: center; }
  /*
    height auto, not a square. The seal is a photograph a little wider than
    it is tall — the ribbon hangs below the disc — and forcing it square
    squashed the ribbon into an unreadable band.
  */
  .seal { position: absolute; left: 0; top: 0; width: 122px; height: auto; }
  /* Nearly the full width of the panel, which is how their sheet has it. */
  .council-seal { display: block; width: 150px; height: auto; margin: 0 auto 4px; }
  .headtext { text-align: center; }
  /* text-indent is set on p for the body paragraphs, which the barangay
     indents; the letterhead and the salutation are not body paragraphs and
     were being pushed off-centre by inheriting it. */
  /*
    text-align as well as text-indent.
    
    The body rule sets p to justify, which beats the centre inherited from
    .headtext because it is the more specific selector — and justify on a
    one-line paragraph renders flush LEFT. So the whole letterhead sat in the
    left margin under the seal while the title below it was properly centred,
    which is exactly the misalignment that was reported.
  */
  .headtext p { margin: 0; line-height: 1.35; font-size: 11pt;
                text-indent: 0; text-align: center; }
  .headtext .office { margin-top: 8px; font-size: 12pt; }
  /*
    Three title settings, because their folder has three: the clearance is
    plain bold; the residency and indigency certificates are set in a script
    face and underlined; the ones simply headed CERTIFICATION are letter-
    spaced and underlined. One setting for all of them made every form look
    like the clearance.
  */
  h1 { text-align: center; font-size: 20pt; margin: 18px 0 16px; letter-spacing: 1px; }
  h1.script { font-family: "Lucida Calligraphy", "Palatino Linotype", "Book Antiqua",
              Palatino, "Times New Roman", serif;
              font-style: italic; font-size: 19pt; letter-spacing: 0;
              text-decoration: underline; }
  h1.spaced { font-size: 17pt; letter-spacing: 3px; text-decoration: underline; }
  .concern { font-weight: bold; margin: 0 0 10px; text-indent: 0; }
  /*
    The clearance is set differently from the certifications: bold, ragged
    right rather than justified, and more open. Justified and light, it read
    as a different document from the one the office hands out.
  */
  .clearance-body p { font-weight: bold; text-align: left; line-height: 2.1;
                      margin-bottom: 16px; }
  .clearance-body p:first-child { text-indent: 0; }
  /* Half an inch, which is the indent on their paper. */
  p { line-height: 1.9; margin: 0 0 13px; text-align: justify; text-indent: 48px; }
  p.center { text-align: center; text-indent: 0; }
  .blank { display: inline-block; border-bottom: 1px solid #000; height: 1em;
           vertical-align: bottom; }
  .ans { text-decoration: none; border-bottom: 1px solid #000; font-weight: bold;
         padding: 0 6px; }
  table { border-collapse: collapse; margin: 0 0 12px 40px; }
  .details td { padding: 2px 6px 2px 0; vertical-align: bottom; }
  /* Indented on the residency form, flush left on the appearance slip —
     as each of the two is set on paper. */
  .details.flush { margin-left: 0; }
  .particulars { margin-left: 0; width: 100%; }
  .particulars td { padding: 3px 8px 3px 0; }
  .clauses { line-height: 1.8; margin: 0 0 12px 20px; }
  .clauses li { margin-bottom: 8px; text-align: justify; }
  .marks { display: flex; gap: 14px; align-items: flex-end; margin: 14px 0 18px; }
  .photo { width: 130px; height: 150px; border: 1px solid #000; overflow: hidden;
           display: flex; align-items: center; justify-content: center; }
  .photo img { width: 100%; height: 100%; object-fit: cover; }
  .thumbs { display: flex; gap: 14px; align-items: flex-end; }
  .thumbs > div { text-align: center; font-size: 9pt; font-weight: bold; }
  .thumb { width: 78px; height: 96px; border: 1px solid #2563eb; margin-bottom: 3px; }
  .sigbox { min-width: 120px; }
  .sigline { border-bottom: 1px solid #000; height: 96px; }
  /*
    Right of centre, not centred. On every one of their forms the signature
    block sits over toward the right margin; centring it left the page
    looking symmetrical in a way the barangay's paper is not.
  */
  .sign { margin-top: 52px; text-align: right; padding-right: 34px; }
  .sign .who { display: inline-block; text-align: center; }
  .sign .who b { display: block; text-decoration: underline; font-size: 12pt; }
  .officer { margin-top: 40px; text-align: center; }
  .officer .line { width: 260px; border-bottom: 1px solid #000; margin: 0 auto 3px; height: 1em; }
  .verify { margin-top: 26px; font-size: 10pt; }
  .verify p { text-indent: 0; margin: 0 0 4px; text-align: left; }
  .verify .names { text-decoration: underline; font-weight: bold; }
  .ref { margin-top: 34px; font-size: 8pt; color: #444; border-top: 1px solid #bbb;
         padding-top: 6px; text-indent: 0; text-align: left; }
  .cut { border: 0; border-top: 1px dashed #999; margin: 26px 0; }
  @media print { .cut { border-top: 1px dashed #999; } }
`;

/**
 * The whole printable document, ready for a new window.
 *
 * `council` comes from the Officials roster, which is why the Punong
 * Barangay's name is no longer typed into the code — when the barangay
 * changes, they edit the roster once instead of every template.
 */
export function buildCertificateHtml(
  certificate: PrintableCertificate,
  council: CouncilMember[],
  options: { letterhead: string; office: string },
): string {
  const on = new Date();
  const { title, html, titleStyle } = body(certificate, on);
  const punongBarangay =
    council.find((m) => m.position === "Punong Barangay")?.name ?? "";

  const signature = `
    <div class="sign">
      <div class="who">
        <b>${escapeHtml(punongBarangay.replace(/^HON\.\s*/i, ""))}</b>
        ${escapeHtml(options.office)}
      </div>
    </div>`;

  /*
   * Only the clearance carries the officer of the day and the volunteers'
   * check — the other eleven forms are signed by the Punong Barangay alone,
   * and adding lines nobody signs would invite somebody to sign them.
   */
  const isClearance = options.letterhead === "council";

  const clearanceFooter = isClearance
    ? `
      <div class="officer">
        <div class="line"></div>
        <b>Barangay Kagawad-Officer of the day</b>
      </div>
      <div class="verify">
        <p><b>Checked and Verified by:</b></p>
        <p class="names">${VERIFIERS}</p>
        <p><b>Barangay Population Volunteer&rsquo;s (BPV&rsquo;s)</b></p>
        <p style="margin-top:10px"><b>OR # :</b> ${filled(
          certificate.template_fields?.or_number,
          "150px",
        )}</p>
      </div>`
    : "";

  const reference = `
    <p class="ref">Certificate No. ${escapeHtml(certificate.certificate_number)}
    &middot; Verification Ref. ${escapeHtml(certificate.reference_number)}
    &middot; Verify at the barangay website &rarr; Certificate Verification.</p>`;

  const document = `
    ${/* The clearance's seal is in the council box, so the heading has none. */ ""}
    ${letterhead(options.office, !isClearance)}
    <h1${titleStyle ? ` class="${titleStyle}"` : ""}>${title}</h1>
    ${/*
      Every form but the clearance opens with it.
      
      Their Barangay Clearance goes straight from the title into "This is to
      certify that" — no salutation. It was put on all sixteen out of habit,
      which added a line to the one form that does not have one.
    */ ""}
    ${isClearance ? "" : '<p class="concern">TO WHOM IT MAY CONCERN:</p>'}
    <div class="${isClearance ? "body clearance-body" : "body"}">${html}</div>
    ${signature}
    ${clearanceFooter}
    ${reference}`;

  /*
   * The half-sheet prints twice with a cut line between, exactly as the
   * office's own Certificate of Appearance does — two to a page, snipped
   * apart. Printing one and wasting the other half was never the intent.
   */
  const main = options.letterhead === "half"
    ? `${document}<hr class="cut"/>${document}`
    : document;

  return `<!doctype html><html><head><meta charset="utf-8"/>
    <title>${escapeHtml(certificate.certificate_number)} — ${escapeHtml(
      certificate.certificate_type,
    )}</title><style>${STYLE}</style></head><body>
    <div class="sheet">
      ${isClearance ? sidebar(council) : ""}
      <div class="main">${main}</div>
    </div>
    <script>window.onload = function () { window.print(); };</script>
    </body></html>`;
}
