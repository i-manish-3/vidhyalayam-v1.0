// One-time backfill: assign a shared familyId to every Student that already
// has a sibling chain (via Student.siblingId), and copy the same id to any
// linked Admission row.
//
// Idempotent: skips students that already have familyId set.
// Run with: bun run scripts/backfill-family-id.ts

import { db } from '../src/lib/db'
import { randomUUID } from 'node:crypto'

type StudentRow = { id: string; siblingId: string | null; familyId: string | null }

class UnionFind {
  private parent = new Map<string, string>()

  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id)
  }

  find(id: string): string {
    let root = id
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!
    }
    // path compression
    let cur = id
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!
      this.parent.set(cur, root)
      cur = next
    }
    return root
  }

  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }

  componentsByRoot(): Map<string, string[]> {
    const groups = new Map<string, string[]>()
    for (const id of this.parent.keys()) {
      const root = this.find(id)
      const list = groups.get(root) || []
      list.push(id)
      groups.set(root, list)
    }
    return groups
  }
}

async function main() {
  console.log('🔁 Loading students…')
  const students: StudentRow[] = await db.student.findMany({
    where: { deletedAt: null },
    select: { id: true, siblingId: true, familyId: true },
  })

  console.log(`   Total students: ${students.length}`)

  const uf = new UnionFind()
  const existingFamilyByStudent = new Map<string, string>()

  for (const s of students) {
    uf.add(s.id)
    if (s.familyId) existingFamilyByStudent.set(s.id, s.familyId)
    if (s.siblingId) {
      uf.add(s.siblingId)
      uf.union(s.id, s.siblingId)
    }
  }

  const components = uf.componentsByRoot()
  console.log(`   Components: ${components.size}`)

  // Decide a familyId per component: prefer an existing one if any member
  // already has it (keeps backfill idempotent across reruns).
  let updatedStudents = 0
  let updatedAdmissions = 0
  let familiesFormed = 0
  let singletonsAssigned = 0

  for (const memberIds of components.values()) {
    let familyId: string | null = null
    for (const id of memberIds) {
      const existing = existingFamilyByStudent.get(id)
      if (existing) { familyId = existing; break }
    }
    if (!familyId) familyId = randomUUID()

    const toUpdate = memberIds.filter(id => existingFamilyByStudent.get(id) !== familyId)
    if (toUpdate.length === 0) continue

    await db.student.updateMany({
      where: { id: { in: toUpdate } },
      data: { familyId },
    })
    updatedStudents += toUpdate.length

    const adm = await db.admission.updateMany({
      where: { studentId: { in: toUpdate } },
      data: { familyId },
    })
    updatedAdmissions += adm.count

    if (memberIds.length > 1) familiesFormed += 1
    else singletonsAssigned += 1
  }

  console.log('✅ Backfill complete')
  console.log(`   Students updated:    ${updatedStudents}`)
  console.log(`   Admissions updated:  ${updatedAdmissions}`)
  console.log(`   Multi-member families: ${familiesFormed}`)
  console.log(`   Singletons assigned:   ${singletonsAssigned}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Backfill failed:', err)
    process.exit(1)
  })
