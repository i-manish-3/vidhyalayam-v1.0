import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'
import { uploadIfDataUrl, IMAGE_MIME_TYPES, IMAGE_MIME_TYPES_WITH_ICO } from '@/lib/storage'

export async function PATCH(req: NextRequest) {
  try {
    const user = requireRole(req, ['SCHOOL_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }
    if (!user.schoolId) {
      return apiError(400, 'No school is linked with your account.')
    }

    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    const logo = typeof body.logo === 'string' ? body.logo.trim() : body.logo === null ? null : undefined
    const favicon = typeof body.favicon === 'string' ? body.favicon.trim() : body.favicon === null ? null : undefined
    const printHeader = typeof body.printHeader === 'string' ? body.printHeader.trim() : body.printHeader === null ? null : undefined
    const registrationNumber = typeof body.registrationNumber === 'string' ? body.registrationNumber.trim() : body.registrationNumber === null ? null : undefined
    const udiseNumber = typeof body.udiseNumber === 'string' ? body.udiseNumber.trim() : body.udiseNumber === null ? null : undefined
    const affiliationNumber = typeof body.affiliationNumber === 'string' ? body.affiliationNumber.trim() : body.affiliationNumber === null ? null : undefined
    const establishedYear = typeof body.establishedYear === 'string' ? body.establishedYear.trim() : body.establishedYear === null ? null : undefined
    const principalSignature = typeof body.principalSignature === 'string' ? body.principalSignature.trim() : body.principalSignature === null ? null : undefined
    const board = typeof body.board === 'string' && body.board.trim() ? body.board.trim() : undefined
    // Blank string normalises to null so "cleared" and "unset" are stored alike.
    const principalName = typeof body.principalName === 'string' ? (body.principalName.trim() || null) : body.principalName === null ? null : undefined
    const trustName = typeof body.trustName === 'string' ? (body.trustName.trim() || null) : body.trustName === null ? null : undefined
    // Admit-card instructions: accept an array of strings and store as JSON.
    let admitCardInstructions: string | null | undefined
    if (Array.isArray(body.admitCardInstructions)) {
      const lines = body.admitCardInstructions
        .filter((s: unknown): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 12)
      admitCardInstructions = lines.length > 0 ? JSON.stringify(lines) : null
    } else if (body.admitCardInstructions === null) {
      admitCardInstructions = null
    }
    const inventoryDuesOnFeePage = typeof body.inventoryDuesOnFeePage === 'boolean' ? body.inventoryDuesOnFeePage : undefined

    let workingDays: string | undefined
    if (Array.isArray(body.workingDays)) {
      const VALID_DAYS = new Set(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])
      const days = body.workingDays.filter((d: unknown) => typeof d === 'string' && VALID_DAYS.has(d))
      if (days.length === 0) return apiError(400, 'Please select at least one working day.')
      workingDays = JSON.stringify(days)
    }

    if (name !== undefined && !name) {
      return apiError(400, 'Please enter a school name.')
    }
    if (name === undefined && logo === undefined && favicon === undefined && printHeader === undefined && registrationNumber === undefined && udiseNumber === undefined && affiliationNumber === undefined && establishedYear === undefined && principalSignature === undefined && board === undefined && principalName === undefined && trustName === undefined && admitCardInstructions === undefined && workingDays === undefined && inventoryDuesOnFeePage === undefined) {
      return apiError(400, 'Please provide at least one branding update.')
    }

    // Resolve current stored URLs so we can delete the old file when a new one
    // is uploaded (avoids dangling orphans piling up in R2 / public/uploads).
    const existing = await db.school.findUnique({
      where: { id: user.schoolId },
      select: { logo: true, favicon: true, printHeader: true, principalSignature: true },
    })

    const logoUpload = await uploadIfDataUrl(logo, {
      folder: `schools/${user.schoolId}/logo`,
      maxBytes: 2 * 1024 * 1024,
      allowedMimeTypes: IMAGE_MIME_TYPES,
      previousUrl: existing?.logo,
    })
    if (logoUpload.error) return apiError(400, `Logo: ${logoUpload.error}`)

    const faviconUpload = await uploadIfDataUrl(favicon, {
      folder: `schools/${user.schoolId}/favicon`,
      maxBytes: 512 * 1024,
      allowedMimeTypes: IMAGE_MIME_TYPES_WITH_ICO,
      previousUrl: existing?.favicon,
    })
    if (faviconUpload.error) return apiError(400, `Favicon: ${faviconUpload.error}`)

    const printHeaderUpload = await uploadIfDataUrl(printHeader, {
      folder: `schools/${user.schoolId}/print-header`,
      maxBytes: 3 * 1024 * 1024,
      allowedMimeTypes: IMAGE_MIME_TYPES,
      previousUrl: existing?.printHeader,
    })
    if (printHeaderUpload.error) return apiError(400, `Print header: ${printHeaderUpload.error}`)

    const principalSignatureUpload = await uploadIfDataUrl(principalSignature, {
      folder: `schools/${user.schoolId}/principal-signature`,
      maxBytes: 1024 * 1024,
      allowedMimeTypes: IMAGE_MIME_TYPES,
      previousUrl: existing?.principalSignature,
    })
    if (principalSignatureUpload.error) return apiError(400, `Principal signature: ${principalSignatureUpload.error}`)

    const school = await db.school.update({
      where: { id: user.schoolId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(logoUpload.url !== undefined ? { logo: logoUpload.url } : {}),
        ...(faviconUpload.url !== undefined ? { favicon: faviconUpload.url } : {}),
        ...(printHeaderUpload.url !== undefined ? { printHeader: printHeaderUpload.url } : {}),
        ...(registrationNumber !== undefined ? { registrationNumber } : {}),
        ...(udiseNumber !== undefined ? { udiseNumber } : {}),
        ...(affiliationNumber !== undefined ? { affiliationNumber } : {}),
        ...(establishedYear !== undefined ? { establishedYear } : {}),
        ...(principalSignatureUpload.url !== undefined ? { principalSignature: principalSignatureUpload.url } : {}),
        ...(board !== undefined ? { board } : {}),
        ...(principalName !== undefined ? { principalName } : {}),
        ...(trustName !== undefined ? { trustName } : {}),
        ...(admitCardInstructions !== undefined ? { admitCardInstructions } : {}),
        ...(workingDays !== undefined ? { workingDays } : {}),
        ...(inventoryDuesOnFeePage !== undefined ? { inventoryDuesOnFeePage } : {}),
      },
      select: {
        id: true,
        name: true,
        logo: true,
        favicon: true,
        printHeader: true,
        registrationNumber: true,
        udiseNumber: true,
        affiliationNumber: true,
        establishedYear: true,
        principalSignature: true,
        principalName: true,
        trustName: true,
        admitCardInstructions: true,
        status: true,
        academicYear: true,
        board: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        country: true,
        contactPhone: true,
        contactEmail: true,
        website: true,
        workingDays: true,
        inventoryDuesOnFeePage: true,
      },
    })

    return NextResponse.json({ school })
  } catch (error) {
    console.error('Update school theme error:', error)
    return internalError('updating school theme')
  }
}
