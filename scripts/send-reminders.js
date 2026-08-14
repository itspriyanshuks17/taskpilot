// Runs on a GitHub Actions schedule. Queries Supabase for pending tasks
// that are due today or overdue, and emails a digest via the Resend API.
//
// Required environment variables (set as GitHub repo secrets):
//   SUPABASE_URL          - your Supabase project URL
//   SUPABASE_SERVICE_KEY  - Supabase "service_role" key (NOT the anon key)
//   RESEND_API_KEY        - API key from resend.com (free tier: 100 emails/day)
//   NOTIFY_EMAIL           - where reminders should be sent
// Optional:
//   RESEND_FROM            - verified sender address (defaults to Resend's shared test address)

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  RESEND_API_KEY,
  NOTIFY_EMAIL,
  RESEND_FROM = 'TaskPilot <onboarding@resend.dev>'
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}
requireEnv('SUPABASE_URL', SUPABASE_URL);
requireEnv('SUPABASE_SERVICE_KEY', SUPABASE_SERVICE_KEY);
requireEnv('RESEND_API_KEY', RESEND_API_KEY);
requireEnv('NOTIFY_EMAIL', NOTIFY_EMAIL);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const today = todayStr();

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .neq('status', 'done')
    .lte('due_date', today)
    .order('due_date', { ascending: true });

  if (error) {
    console.error('Supabase query failed:', error.message);
    process.exit(1);
  }

  if (!tasks || tasks.length === 0) {
    console.log('No due or overdue tasks. Nothing to send.');
    return;
  }

  const overdue = tasks.filter(t => t.due_date < today);
  const dueToday = tasks.filter(t => t.due_date === today);

  const html = buildEmailHtml({ overdue, dueToday, today });
  const subjectBits = [];
  if (dueToday.length) subjectBits.push(`${dueToday.length} due today`);
  if (overdue.length) subjectBits.push(`${overdue.length} overdue`);
  const subject = `TaskPilot — ${subjectBits.join(', ')}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [NOTIFY_EMAIL],
      subject,
      html
    })
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Resend API error:', res.status, body);
    process.exit(1);
  }

  console.log(`Reminder sent to ${NOTIFY_EMAIL}: ${dueToday.length} due today, ${overdue.length} overdue.`);

  // Mark today's tasks as having had a reminder sent (kept for record-keeping;
  // does not block future digests since we always query by due_date <= today).
  const idsToMark = dueToday.filter(t => !t.reminder_sent).map(t => t.id);
  if (idsToMark.length) {
    await supabase.from('tasks').update({ reminder_sent: true }).in('id', idsToMark);
  }
}

function buildEmailHtml({ overdue, dueToday, today }) {
  const row = (t) => `
    <tr>
      <td style="padding:8px 12px; border-bottom:1px solid #22314D; font-family:monospace; font-size:12px; color:#8CA0BE;">${t.due_date}${t.due_time ? ' ' + t.due_time.slice(0,5) : ''}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #22314D; font-size:14px; color:#E7ECF3;">${escapeHtml(t.title)}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #22314D; font-size:11px; text-transform:uppercase; color:#8CA0BE;">${t.priority}</td>
    </tr>`;

  const section = (label, color, list) => list.length ? `
    <h3 style="font-family:monospace; font-size:13px; letter-spacing:.05em; text-transform:uppercase; color:${color}; margin:20px 0 8px;">${label} (${list.length})</h3>
    <table style="width:100%; border-collapse:collapse;">${list.map(row).join('')}</table>
  ` : '';

  return `
  <div style="background:#0B1424; padding:24px; font-family:sans-serif;">
    <div style="max-width:520px; margin:0 auto; background:#101C30; border:1px solid #22314D; border-radius:8px; padding:24px;">
      <div style="font-family:monospace; color:#2FE0C8; font-size:13px; letter-spacing:.08em; margin-bottom:4px;">◈ TASKPILOT</div>
      <p style="color:#8CA0BE; font-size:13px; margin-bottom:8px;">Daily digest for ${today}</p>
      ${section('Overdue', '#FF6161', overdue)}
      ${section('Due Today', '#2FE0C8', dueToday)}
    </div>
  </div>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
