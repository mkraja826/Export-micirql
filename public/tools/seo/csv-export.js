// Deterministic CSV serialization for SEO Studio's browser-local audit reports.
const quote = value => {
  const raw = String(value ?? '');
  // Prevent Excel/Sheets from evaluating untrusted page titles and URLs as formulas.
  const safe = /^[\\s\\u0000-\\u001f]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
};
export function csvRows(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => quote(value)).join(',')).join('\r\n') + '\r\n';
}
export function seoPagesCsv(report) {
  const rows = [['Requested URL','Final URL','Page role','Score','Audit status','Partial','Finding count','High','Medium','Low','Info']];
  for (const page of report?.reports ?? []) {
    const findings = page.findings ?? [];
    rows.push([page.requestedUrl || page.url, page.url, page.pageRole || '', page.score ?? '',
      page.auditStatus || '', page.partial === true ? 'yes' : 'no', findings.length,
      ...['high','medium','low','info'].map(level => findings.filter(f => f.severity === level).length)]);
  }
  return csvRows(rows);
}
export function seoIssuesCsv(report) {
  const rows = [['Severity','Code','Issue','Recommendation','Affected URL','Fix scope','Verification required']];
  for (const issue of report?.issueCenter ?? []) {
    for (const url of issue.affectedUrls?.length ? issue.affectedUrls : ['']) {
      rows.push([issue.severity,issue.code,issue.message || issue.title || '',
        issue.recommendation || '',url,issue.fixScope || '',issue.fixGuide?.verificationRequired === true ? 'yes' : 'no']);
    }
  }
  return csvRows(rows);
}
