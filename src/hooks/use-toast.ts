"use client"

import * as React from "react"

import type { ToastActionElement, ToastProps } from "@/components/ui/toast"

const TOAST_LIMIT = 3
const TOAST_REMOVE_DELAY = 2000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

/**
 * Auto-detect toast variant based on title keywords.
 * Maps to theme-matched variants: success, destructive, warning, info, default.
 */
function detectVariant(title: string, explicitVariant?: string): ToastProps["variant"] {
  if (explicitVariant) return explicitVariant as ToastProps["variant"]

  const lower = title.toLowerCase()

  // ── Success: emerald toasts ──
  if (
    lower.includes("success") ||
    lower.includes("saved") ||
    lower.includes("added") ||
    lower.includes("created") ||
    lower.includes("updated") ||
    lower.includes("deleted") ||
    lower.includes("removed") ||
    lower.includes("completed") ||
    lower.includes("verified") ||
    lower.includes("approved") ||
    lower.includes("welcome") ||
    lower.includes("uploaded") ||
    lower.includes("done") ||
    lower.includes("finalized") ||
    lower.includes("attendance saved") ||
    lower.includes("entry added") ||
    lower.includes("entry updated") ||
    lower.includes("entry deleted") ||
    lower.includes("periods saved") ||
    lower.includes("draft saved")
  ) {
    return "success"
  }

  // ── Error: red/destructive toasts ──
  if (
    lower.includes("error") ||
    lower.includes("failed") ||
    lower.includes("invalid") ||
    lower.includes("validation") ||
    lower.includes("cannot") ||
    lower.includes("conflict") ||
    lower.includes("couldn't") ||
    lower.includes("missing") ||
    lower.includes("save failed") ||
    lower.includes("delete failed") ||
    lower.includes("finalize failed") ||
    lower.includes("something went wrong") ||
    lower.includes("update failed") ||
    lower.includes("file too large")
  ) {
    return "destructive"
  }

  // ── Warning: amber toasts ──
  if (
    lower.includes("warning") ||
    lower.includes("caution") ||
    lower.includes("attention") ||
    lower.includes("unpaid fees") ||
    lower.includes("check your input")
  ) {
    return "warning"
  }

  // ── Info: slate toasts ──
  if (
    lower.includes("info") ||
    lower.includes("note") ||
    lower.includes("print") ||
    lower.includes("coming soon") ||
    lower.includes("exported")
  ) {
    return "info"
  }

  return "default"
}

function toast({ title, ...props }: Toast) {
  const id = genId()

  // Auto-detect variant from title
  const titleStr = typeof title === "string" ? title : ""
  const variant = detectVariant(titleStr, props.variant as string | undefined)

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      title,
      variant,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
