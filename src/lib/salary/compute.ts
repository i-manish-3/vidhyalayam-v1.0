/**
 * Shared payslip math. Used by both single-payment recording and bulk payroll
 * runs so a payslip is computed identically regardless of entry path.
 */

import { salaryRound } from './staff-resolver'

export interface SalaryStructureLike {
  basicSalary: number
  hra: number
  da: number
  ta: number
  medicalAllowance: number
  specialAllowance: number
  pf: number
  esi: number
  tax: number
  otherDeductions: number
  grossSalary: number
  standardDays: number
}

export interface PayslipInput {
  structure: SalaryStructureLike
  /** Loss-of-pay / unpaid days for the period. Clamped to [0, standardDays]. */
  lopDays?: number
  /** Approved advance amount to recover this period. */
  advanceDeduction?: number
}

export interface PayslipBreakdown {
  basicSalary: number
  hra: number
  da: number
  ta: number
  medicalAllowance: number
  specialAllowance: number
  grossEarnings: number
  pf: number
  esi: number
  tax: number
  advanceDeduction: number
  lopDays: number
  paidDays: number
  lopDeduction: number
  otherDeductions: number
  totalDeductions: number
  netPayable: number
}

/**
 * Compute a payslip from a salary structure plus per-period adjustments.
 * LOP is prorated against the structure's standardDays using basic pay.
 */
export function computePayslip({ structure, lopDays = 0, advanceDeduction = 0 }: PayslipInput): PayslipBreakdown {
  const standardDays = structure.standardDays > 0 ? structure.standardDays : 30
  const safeLopDays = Math.min(Math.max(lopDays || 0, 0), standardDays)
  const paidDays = salaryRound(standardDays - safeLopDays)

  const perDayBasic = structure.basicSalary / standardDays
  const lopDeduction = salaryRound(perDayBasic * safeLopDays)
  const advanceDed = salaryRound(Math.max(advanceDeduction || 0, 0))

  const grossEarnings = salaryRound(structure.grossSalary)
  const totalDeductions = salaryRound(
    structure.pf + structure.esi + structure.tax + structure.otherDeductions + advanceDed + lopDeduction
  )
  const netPayable = salaryRound(grossEarnings - totalDeductions)

  return {
    basicSalary: salaryRound(structure.basicSalary),
    hra: salaryRound(structure.hra),
    da: salaryRound(structure.da),
    ta: salaryRound(structure.ta),
    medicalAllowance: salaryRound(structure.medicalAllowance),
    specialAllowance: salaryRound(structure.specialAllowance),
    grossEarnings,
    pf: salaryRound(structure.pf),
    esi: salaryRound(structure.esi),
    tax: salaryRound(structure.tax),
    advanceDeduction: advanceDed,
    lopDays: safeLopDays,
    paidDays,
    lopDeduction,
    otherDeductions: salaryRound(structure.otherDeductions),
    totalDeductions,
    netPayable,
  }
}
