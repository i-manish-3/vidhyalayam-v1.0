import { db } from '../../src/lib/db'

async function main() {
  // Seed default team members (idempotent - checks for existing records by name)
  const existing = await db.teamMember.findMany({ where: { deletedAt: null } })
  const existingNames = new Set(existing.map(m => m.name))

  const members = [
    {
      name: 'Manish Kumar',
      role: 'Developer',
      bio: "Full-stack developer passionate about building scalable SaaS products. Architect of Vidhyalayam's platform and core technology.",
      image: '/uploads/team/manish-kumar.png',
      phone: '+91 98765 43210',
      email: null,
      linkedin: null,
      twitter: null,
      github: null,
      instagram: null,
      facebook: null,
      website: null,
      isActive: true,
      sortOrder: 1,
    },
    {
      name: 'Ashish Arya',
      role: 'Marketing Head',
      bio: 'Strategic marketing professional driving growth and brand visibility. Connecting schools with the digital tools they need to succeed.',
      image: '/uploads/team/ashish-arya.png',
      phone: '+91 98765 67890',
      email: null,
      linkedin: null,
      twitter: null,
      github: null,
      instagram: null,
      facebook: null,
      website: null,
      isActive: true,
      sortOrder: 2,
    },
  ]

  let created = 0
  for (const member of members) {
    if (!existingNames.has(member.name)) {
      await db.teamMember.create({ data: member })
      created++
      console.log(`Created team member: ${member.name}`)
    } else {
      console.log(`Team member already exists: ${member.name}`)
    }
  }

  console.log(`\nDone! Created ${created} team member(s).`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
