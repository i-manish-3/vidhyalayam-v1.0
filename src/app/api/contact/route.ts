import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError, internalError } from '@/lib/api-errors'

// Public endpoint: submit contact/demo request from landing page
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, schoolName, email, phone, studentCount, message, addOns } = body

    // Validate required fields
    if (!name || !schoolName || !email || !phone) {
      return apiError(400, 'Please fill in your name, school name, email, and phone number.')
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return apiError(400, 'Please enter a valid email address (e.g., name@school.com).')
    }

    // Validate phone (basic - at least 10 digits)
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length < 10) {
      return apiError(400, 'Please enter a valid phone number (at least 10 digits).')
    }

    const contactRequest = await db.contactRequest.create({
      data: {
        name,
        schoolName,
        email,
        phone,
        studentCount: studentCount ? parseInt(studentCount) : 0,
        message: message || null,
        addOns: addOns ? JSON.stringify(addOns) : null,
        status: 'new',
      },
    })

    // Create notifications for all Super Admins
    try {
      const superAdmins = await db.user.findMany({
        where: { role: 'SUPER_ADMIN' },
        select: { id: true },
      })

      if (superAdmins.length > 0) {
        const studentInfo = studentCount ? ` | Students: ${studentCount}` : ''
        await db.notification.createMany({
          data: superAdmins.map((admin) => ({
            schoolId: null, // System-wide notification
            userId: admin.id,
            title: 'New Contact Request',
            message: `${name} from ${schoolName} submitted a contact request.${studentInfo}`,
            type: 'warning',
          })),
        })
      }
    } catch (notifError) {
      // Don't fail the contact submission if notification creation fails
      console.error('Failed to create notification for super admins:', notifError)
    }

    return NextResponse.json({
      success: true,
      message: 'Thank you! We will contact you shortly.',
      id: contactRequest.id
    })
  } catch (error) {
    console.error('Contact request error:', error)
    return internalError('submitting your request')
  }
}
