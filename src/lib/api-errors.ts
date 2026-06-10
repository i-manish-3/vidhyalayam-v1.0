import { NextResponse } from 'next/server'

/**
 * User-friendly API error response helper.
 *
 * Every message follows 3 rules:
 * 1. CLEAR — What exactly happened?
 * 2. ACTIONABLE — What should the user do next?
 * 3. HUMAN — No technical jargon, speak like a person
 *
 * Usage:
 *   return apiError(400, 'Please enter a valid student name.')
 *   return apiError(401)  // uses default message for that status
 */

const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'The information you entered seems incorrect. Please check and try again.',
  401: 'Your session has expired. Please log in again to continue.',
  403: "You don't have permission to do this. Please contact your administrator if you think this is a mistake.",
  404: 'We couldn\'t find what you\'re looking for. It may have been removed or moved.',
  405: 'This action isn\'t available right now.',
  409: 'This record already exists or was modified by someone else. Please refresh and try again.',
  422: 'Some of the information you entered is incorrect. Please review the highlighted fields and fix them.',
  429: 'You\'re doing that too quickly. Please wait a moment and try again.',
  500: 'We ran into an unexpected issue. Our team has been notified. Please try again in a few minutes.',
  502: 'The server is temporarily unavailable. Please wait a moment and try again.',
  503: 'We\'re doing some maintenance right now. Please check back in a few minutes.',
}

export function apiError(status: number, message?: string): NextResponse {
  const msg = message || DEFAULT_MESSAGES[status] || `We ran into an unexpected issue. Please try again.`
  return NextResponse.json({ message: msg }, { status })
}

/**
 * Unauthorized error — used when no valid auth token is provided.
 */
export function unauthorizedError(): NextResponse {
  return apiError(401, 'Your session has expired. Please log in again to continue.')
}

/**
 * Forbidden error — used when user doesn't have the required role/permission.
 */
export function forbiddenError(message?: string): NextResponse {
  return apiError(403, message || "You don't have permission to do this. Please contact your administrator if you think this is a mistake.")
}

/**
 * Not found error — user-friendly way to say "we couldn't find it".
 */
export function notFoundError(resource?: string): NextResponse {
  const resourceNames: Record<string, string> = {
    User: 'user account',
    Student: 'student record',
    Teacher: 'teacher record',
    School: 'school',
    Class: 'class',
    Section: 'section',
    Subject: 'subject',
    Role: 'role',
    Admission: 'admission record',
    Book: 'book',
    FeeHead: 'fee head',
    FeesGroup: 'fee group',
    FeesStructure: 'fee structure',
    FeeCollection: 'fee collection',
    SalaryStructure: 'salary structure',
    SalaryPayment: 'salary payment',
    TransportRoute: 'transport route',
    LibraryBook: 'library book',
    InventoryItem: 'inventory item',
    Notification: 'notification',
    Announcement: 'announcement',
    PlatformAnnouncement: 'announcement',
    SupportTicket: 'support ticket',
    Export: 'export',
  }
  const friendlyName = resource ? (resourceNames[resource] || resource.toLowerCase()) : 'record'
  const msg = `We couldn't find this ${friendlyName}. It may have been removed or the link may be incorrect.`
  return apiError(404, msg)
}

/**
 * Validation error — for invalid input data.
 */
export function validationError(message: string): NextResponse {
  return apiError(422, message)
}

/**
 * Internal server error — for unexpected errors in catch blocks.
 * Use a user-friendly context like "loading students" or "saving attendance".
 */
export function internalError(context?: string): NextResponse {
  const msg = context
    ? `We ran into a problem while ${context}. Please try again, and if the issue continues, contact support.`
    : 'We ran into an unexpected issue. Please try again, and if the problem continues, contact support.'
  return apiError(500, msg)
}
