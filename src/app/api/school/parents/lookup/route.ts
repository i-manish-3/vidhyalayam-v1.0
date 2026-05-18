import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

// GET /api/school/parents/lookup?phone=9876543210
// Looks up parents by phone number across Parent and Admission records.
// Used to detect if a parent already exists when filling out the admission form.

interface ChildInfo {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string | null
  className: string | null
  sectionName: string | null
}

interface ParentMatch {
  source: 'parent' | 'admission'
  parentId: string | null
  fatherName: string | null
  fatherPhone: string | null
  motherName: string | null
  motherPhone: string | null
  children: ChildInfo[]
}

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const phone = (searchParams.get('phone') || '').trim()

    // Validate phone number: at least 10 digits
    const digitsOnly = phone.replace(/\D/g, '')
    if (digitsOnly.length < 10) {
      return NextResponse.json(
        { message: 'Please enter a valid 10-digit phone number to search for a parent.' },
        { status: 422 }
      )
    }

    const schoolId = user.schoolId
    const matches: ParentMatch[] = []
    // Track student IDs we've already included to deduplicate
    const seenStudentIds = new Set<string>()

    // 1. Search Parent records where phone or alternatePhone matches
    const parentRecords = await db.parent.findMany({
      where: {
        schoolId,
        deletedAt: null,
        OR: [
          { phone: { contains: phone } },
          { alternatePhone: { contains: phone } },
        ],
      },
      include: {
        children: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                admissionNumber: true,
                class: { select: { name: true } },
                section: { select: { name: true } },
                deletedAt: true,
              },
            },
          },
        },
      },
    })

    for (const parent of parentRecords) {
      const children: ChildInfo[] = []

      for (const link of parent.children) {
        const student = link.student
        // Skip soft-deleted students
        if (student.deletedAt) continue

        seenStudentIds.add(student.id)
        children.push({
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          admissionNumber: student.admissionNumber,
          className: student.class?.name ?? null,
          sectionName: student.section?.name ?? null,
        })
      }

      matches.push({
        source: 'parent',
        parentId: parent.id,
        fatherName: parent.fatherName,
        fatherPhone: parent.phone,
        motherName: parent.motherName,
        motherPhone: parent.alternatePhone,
        children,
      })
    }

    // 2. Search Admission records where fatherPhone or motherPhone matches
    const admissionRecords = await db.admission.findMany({
      where: {
        schoolId,
        deletedAt: null,
        status: 'admitted',
        OR: [
          { fatherPhone: { contains: phone } },
          { motherPhone: { contains: phone } },
        ],
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
            deletedAt: true,
          },
        },
      },
    })

    for (const admission of admissionRecords) {
      const children: ChildInfo[] = []

      // Get the student linked to this admission (if any)
      if (admission.student && !admission.student.deletedAt) {
        // Deduplicate: skip if this student was already included from a Parent record
        if (!seenStudentIds.has(admission.student.id)) {
          children.push({
            id: admission.student.id,
            firstName: admission.student.firstName,
            lastName: admission.student.lastName,
            admissionNumber: admission.student.admissionNumber,
            className: admission.student.class?.name ?? null,
            sectionName: admission.student.section?.name ?? null,
          })
        }
      }

      matches.push({
        source: 'admission',
        parentId: null,
        fatherName: admission.fatherName,
        fatherPhone: admission.fatherPhone,
        motherName: admission.motherName,
        motherPhone: admission.motherPhone,
        children,
      })
    }

    return NextResponse.json({ matches })
  } catch (error) {
    console.error('Parent lookup error:', error)
    return internalError('searching for the parent')
  }
}
