import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './layouts/AppShell'
import { AuthGuard } from '@/features/auth/AuthGuard'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { InviteAcceptPage } from '@/features/institution/InviteAcceptPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { GeneratePage } from '@/features/generate/GeneratePage'
import { QuestionBankPage } from '@/features/question-bank/QuestionBankPage'
import { QuestionSetsPage } from '@/features/sets/QuestionSetsPage'
import { MyBanksPage } from '@/features/my-banks/MyBanksPage'
import { ImportsPage } from '@/features/imports/ImportsPage'
import { StudentsPage } from '@/features/students/StudentsPage'
import { InstitutionPage } from '@/features/institution/InstitutionPage'
import { BillingPage } from '@/features/billing/BillingPage'
import { SupportPage } from '@/features/support/SupportPage'
import { PaperPrintPage } from '@/features/sets/PaperPrintPage'

export const router = createBrowserRouter([
  // Public auth routes
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/invite/:token',
    element: <InviteAcceptPage />,
  },

  // Protected application routes
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: '/',
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: '/dashboard',
            element: <DashboardPage />,
          },
          {
            path: '/generate',
            element: <GeneratePage />,
          },
          {
            path: '/question-bank',
            element: <QuestionBankPage />,
          },
          {
            path: '/sets',
            element: <QuestionSetsPage />,
          },
          {
            path: '/sets/:id',
            element: <PaperPrintPage />,
          },
          {
            path: '/print/sets/:id',
            element: <PaperPrintPage />,
          },
          {
            path: '/my-banks',
            element: <MyBanksPage />,
          },
          {
            path: '/imports',
            element: <ImportsPage />,
          },
          {
            path: '/students',
            element: <StudentsPage />,
          },
          {
            path: '/institution',
            element: <InstitutionPage />,
          },
          {
            path: '/billing',
            element: <BillingPage />,
          },
          {
            path: '/subscription',
            element: <Navigate to="/billing" replace />,
          },
          {
            path: '/tutorials',
            element: <SupportPage />,
          },
          {
            path: '/support',
            element: <SupportPage />,
          },
        ],
      },
    ],
  },

  // Fallback
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
])
