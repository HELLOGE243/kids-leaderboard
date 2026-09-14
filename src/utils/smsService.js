import { logSms } from '../data/store.js'

const SMS_FUNCTION_URL = import.meta.env.VITE_SMS_FUNCTION_URL || ''

export async function sendOverdueSMS({ studentId, studentName, parentPhone, overdueCount, orgId, orgName }) {
  if (!parentPhone || !SMS_FUNCTION_URL) {
    return { success: false, error: 'No phone number or SMS function URL configured' }
  }

  const message = `Hi, this is ${orgName}. ${studentName} has ${overdueCount} overdue assignment${overdueCount !== 1 ? 's' : ''}. Please remind them to complete their homework. Thank you!`

  try {
    const res = await fetch(SMS_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: parentPhone, message }),
    })
    const data = await res.json()

    logSms({
      orgId,
      studentId,
      phone: parentPhone,
      message,
      status: data.success ? 'sent' : 'failed',
      error: data.error || '',
    })

    return data
  } catch (err) {
    logSms({
      orgId,
      studentId,
      phone: parentPhone,
      message,
      status: 'failed',
      error: err.message,
    })
    return { success: false, error: err.message }
  }
}

export async function sendBulkOverdueSMS(students, orgId, orgName) {
  const results = []
  for (const s of students) {
    if (!s.parentPhone) {
      results.push({ studentId: s.studentId, name: s.name, status: 'skipped', error: 'No phone' })
      continue
    }
    const result = await sendOverdueSMS({
      studentId: s.studentId,
      studentName: s.name,
      parentPhone: s.parentPhone,
      overdueCount: s.overdue,
      orgId,
      orgName,
    })
    results.push({ studentId: s.studentId, name: s.name, ...result })
  }
  return results
}
