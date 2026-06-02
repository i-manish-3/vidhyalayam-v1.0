import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const [users, schools, paradigms, gradeScales, templates, groups, bands, examPerms, roles, schoolPerms] = await Promise.all([
  db.user.count(),
  db.school.count(),
  db.examParadigm.count(),
  db.gradeScale.count(),
  db.reportCardTemplate.count(),
  db.examGroup.count(),
  db.gradeBand.count(),
  db.permission.count({ where: { module: 'exams' } }),
  db.role.count(),
  db.schoolPermission.count(),
])
console.log(JSON.stringify({ users, schools, paradigms, gradeScales, templates, groups, bands, examPerms, roles, schoolPerms }, null, 2))
await db.$disconnect()
