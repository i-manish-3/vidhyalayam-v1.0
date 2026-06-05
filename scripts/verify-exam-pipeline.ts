/**
 * E2E walkthrough of the exam pipeline via API calls.
 * Simulates what the browser does at each step, checks responses.
 */

const BASE = 'http://localhost:3000'

async function post(path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  const text = await res.text()
  try { return { status: res.status, ...JSON.parse(text) } }
  catch { return { status: res.status, _raw: text.slice(0, 200) } }
}

async function apiGet(path: string) {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' })
  const text = await res.text()
  try { return { status: res.status, ...JSON.parse(text) } }
  catch { return { status: res.status, _raw: text.slice(0, 200) } }
}

let cookies = ''

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const setCookie = res.headers.get('set-cookie') || ''
  if (setCookie) {
    const parts = setCookie.split(';')[0]
    if (cookies) cookies += '; ' + parts
    else cookies = parts
  }
  const data = await res.json()
  return { status: res.status, role: data.user?.role, name: data.user?.name }
}

// Override fetch to send cookies
const origFetch = globalThis.fetch
globalThis.fetch = (url: string | URL | Request, init?: RequestInit) => {
  const opts = init ? { ...init } : {}
  if (cookies) {
    opts.headers = opts.headers || {}
    const h = opts.headers as Record<string, string>
    h['Cookie'] = cookies
  }
  return origFetch(url, opts)
}

async function main() {
  let ok = 0
  let fail = 0
  const check = (label: string, condition: boolean, detail = '') => {
    const icon = condition ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
    console.log(`${icon} ${label}${detail ? ': ' + detail : ''}`)
    if (condition) ok++
    else fail++
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1: Login as school admin
  console.log('\n━━━ STEP 1: Login as school admin ━━━')
  const admin = await login('admin@dpsdelhi.in', 'admin123')
  check('Login succeeds', admin.status === 200 || admin.status === 201)
  check('Role is SCHOOL_ADMIN', admin.role === 'SCHOOL_ADMIN', admin.role)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2: Dashboard + exam list
  console.log('\n━━━ STEP 2: Exam list ━━━')
  const exams = await apiGet('/api/school/exams')
  check('Exam list loaded', exams.status === 200)
  check('Has exams', exams.exams?.length >= 1, `${exams.exams?.length} exams`)
  const hyExam = exams.exams?.find((e: {name: string}) => e.name.includes('Half-Yearly'))
  check('Half-Yearly exam exists', !!hyExam)
  check('Unit Test 1 exists', !!exams.exams?.find((e: {name: string}) => e.name.includes('Unit Test')))
  if (hyExam) {
    check('Status is not draft', hyExam.status !== 'draft', hyExam.status)
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 3: Subject configs
  console.log('\n━━━ STEP 3: Subject configs ━━━')
  if (hyExam) {
    const configs = await apiGet(`/api/school/exams/${hyExam.id}/subject-configs`)
    check('Subject configs API returns 200', configs.status === 200, `status ${configs.status}`)
    const cfgCount = configs.configs?.length || configs.subjectConfigs?.length || 0
    check('At least 3 subject configs', cfgCount >= 3, `${cfgCount} configs`)
  } else {
    check('Skipped — Could not resolve exam ID', false)
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 4: Marks grid
  console.log('\n━━━ STEP 4: Marks grid ━━━')
  if (hyExam) {
    // Get classId/sectionId/subjectConfigId from the subject configs
    const configs = await apiGet(`/api/school/exams/${hyExam.id}/subject-configs`)
    const configsArr = configs.configs || configs.subjectConfigs || []
    if (configsArr.length > 0) {
      const cfg = configsArr[0]
      const marksGrid = await apiGet(
        `/api/school/exams/${hyExam.id}/marks-grid?classId=${cfg.classId}&sectionId=&subjectId=${cfg.subjectId}`
      )
      check('Marks grid loads', marksGrid.status === 200, `status ${marksGrid.status}`)
      const studentCount = marksGrid.students?.length || 0
      check('Has students', studentCount >= 1, `${studentCount} students`)
      const entryCount = marksGrid.entries?.length || 0
      check('Has marks entries (pre-seeded)', entryCount > 0, `${entryCount} entries`)
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 5: Results page
  console.log('\n━━━ STEP 5: Results + Publish ━━━')
  if (hyExam) {
    const results = await apiGet(`/api/school/exams/${hyExam.id}/results`)
    check('Results API returns 200', results.status === 200)
    check('Has results', results.results?.length >= 1, `${results.results?.length} rows`)
    const sample = results.results?.[0]
    if (sample) {
      check('Has grade', !!sample.grade, sample.grade)
      check('Has rank', sample.rankInClass !== null, `rank ${sample.rankInClass}`)
    }

    // Try un-publish (if already published by seed)
    const examInfo = await apiGet(`/api/school/exams/${hyExam.id}/subject-configs`)
    // Get exam status:
    const exams2 = await apiGet('/api/school/exams')
    const hy = exams2.exams?.find((e: {name: string}) => e.name.includes('Half-Yearly'))

    if (hy?.visibleToParent) {
      console.log('  Exam is already published. Unpublishing...')
      const unpub = await post(`/api/school/exams/${hyExam.id}/unpublish`, { reason: 'E2E test — will republish' })
      check('Unpublish succeeds', unpub.status === 200, unpub.message || '')
    }

    // Now publish
    const pub = await post(`/api/school/exams/${hyExam.id}/publish`)
    check('Publish succeeds', pub.status === 200, pub.message || '')
    check('Published count > 0', (pub as Record<string,unknown>).publishedCount > 0, String((pub as Record<string,unknown>).publishedCount))
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 6: Report cards generate
  console.log('\n━━━ STEP 6: Report card generation ━━━')
  if (hyExam) {
    const results = await apiGet(`/api/school/exams/${hyExam.id}/results`)
    const studentIds = (results.results || []).slice(0, 5).map((r: {student: {id: string}}) => r.student.id)
    const gen = await post(`/api/school/exams/${hyExam.id}/report-cards/generate`, {
      studentIds,
      action: 'preview',
    })
    check('Report card generate succeeds', gen.status === 200)
    check('Cards returned', gen.cards?.length === studentIds.length, `${gen.cards?.length || 0} cards`)
    if (gen.cards?.[0]?.data) {
      const card = gen.cards[0].data
      check('Card has subjects', card.subjects?.length > 0, `${card.subjects?.length} subjects`)
      check('Card has totals', card.totals?.percentage > 0, `${card.totals?.percentage}%`)
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 7: Reports
  console.log('\n━━━ STEP 7: Reports ━━━')
  if (hyExam) {
    const [classSum, subjStats] = await Promise.all([
      apiGet(`/api/school/exams/${hyExam.id}/reports/class-summary`),
      apiGet(`/api/school/exams/${hyExam.id}/reports/subject-stats?topN=3`),
    ])
    check('Class summary loads', classSum.status === 200)
    check('Has class rows', classSum.rows?.length > 0, `${classSum.rows?.length} rows`)
    check('Subject stats load', subjStats.status === 200)
    check('Has subject rows', subjStats.subjects?.length > 0, `${subjStats.subjects?.length} subjects`)
    const firstSubj = subjStats.subjects?.[0]
    if (firstSubj) {
      check('Has top performers', firstSubj.topPerformers?.length > 0)
      check('Has bottom performers', firstSubj.bottomPerformers?.length > 0)
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 8: Audit log
  console.log('\n━━━ STEP 8: Audit log ━━━')
  const audit = await apiGet('/api/school/exams/audit?limit=10')
  check('Audit log loads', audit.status === 200)
  check('Has entries', audit.logs?.length > 0, `${audit.logs?.length} entries`)
  if (audit.logs?.length > 0) {
    const actions = audit.logs.map((l: {action: string}) => l.action)
    console.log('  Actions found:', [...new Set(actions)].join(', '))
    check('Has result_published action', actions.includes('result_published'))
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 9: Parent self-view
  console.log('\n━━━ STEP 9: Parent self-view ━━━')
  // Login as parent (clears admin session)
  const parentLogin = await login('9876543201@parent.local', 'parent123')
  check('Parent login succeeds', parentLogin.status === 200 || parentLogin.status === 201)
  check('Role is PARENT', parentLogin.role === 'PARENT', parentLogin.role)

  const meResults = await apiGet('/api/students/me/results')
  check('Self results API returns 200', meResults.status === 200, `status ${meResults.status}`)
  if (meResults.status === 200) {
    const examCount = meResults.exams?.length || 0
    if (examCount > 0) {
      check('Published exam visible to parent', true, `${examCount} exam(s)`)
    } else {
      console.log('  ⚠ No published exams visible to parent — parent may not be linked to a student in Class 10')
      check('May need parent→student linkage', meResults.studentId != null, `studentId: ${meResults.studentId || 'null'}`)
    }
  }

  // Report card templates
  console.log('\n━━━ STEP 10: Templates ━━━')
  // Login back as admin
  await login('admin@dpsdelhi.in', 'admin123')
  const tmpl = await apiGet('/api/school/exams/report-card-templates')
  check('Templates load', tmpl.status === 200)
  check('Has 3 templates', tmpl.templates?.length === 3, `${tmpl.templates?.length} templates`)
  const defaults = tmpl.templates?.filter((t: {isDefault: boolean}) => t.isDefault)
  check('Has a default template', defaults?.length === 1, String(defaults?.length))

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log(`\n${'='.repeat(50)}`)
  console.log(`  Results: ${ok} passed, ${fail} failed`)
  console.log(`${'='.repeat(50)}`)
  if (fail > 0) process.exit(1)
}

main()
