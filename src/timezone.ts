// Decision (audit): every tenant works in Uzbekistan, so day boundaries in
// reports, dashboards and debt due dates use Asia/Tashkent. Imported first by
// main.ts so it applies before any Date is created; an explicit TZ in the
// environment still wins.
process.env.TZ = process.env.TZ || 'Asia/Tashkent';

export {};
