# TaskMan

> A multi-tenant workspace and team management platform built on the MERN stack, with role-based access control (RBAC), email verification, invitations, and workspace-level customisation.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb)](https://www.mongodb.com/atlas)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running Locally](#running-locally)
- [Role-Based Access Control](#role-based-access-control)
- [Branch Strategy](#branch-strategy)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
- [Scripts Reference](#scripts-reference)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

TaskMan is a workspace-first collaboration platform. Every user belongs to one or more **workspaces**, and within each workspace they hold a **role** that determines what they can see and do.

The project was built as a monorepo with a clean separation between the API and the client, and includes a full RBAC system with system-defined and custom roles.

**Out of scope:** Task management features (task model, task CRUD, task UI) are being implemented separately by another contributor.

---

## Features

### Authentication
- Email + password signup with bcrypt hashing
- Email verification via Nodemailer (Mailtrap sandbox in development)
- Password reset flow with expiring tokens
- JWT-based sessions with per-device tracking
- Session invalidation on password change

### Workspaces
- Create unlimited workspaces per user
- Switch between workspaces from the sidebar
- Auto-generated URL-safe slugs (`/gomycode/dashboard`)
- Per-workspace invite codes and email invitations
- Member management (invite, change role, remove)

### Onboarding
- Multi-step wizard (role, use case, team size, workspace name)
- Idempotent — safe to refresh
- Persisted to the database, not just localStorage

### Role-Based Access Control (RBAC)
- 5 system roles seeded on startup
- Custom roles with a permission matrix editor
- 10 atomic permissions grouped by area
- Route guards, sidebar filtering, and button gating
- Automatic self-healing for orphaned member entries

### Profile & Settings
- Editable profile (name, bio, title, phone, timezone)
- Notification preferences
- Password change with current-password verification

---

## Tech Stack

### Frontend
| Layer | Technology |
| :--- | :--- |
| Framework | React 18 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui + Radix UI |
| Icons | Lucide React |
| Routing | React Router v6 |
| HTTP | Axios (with interceptors) |

### Backend
| Layer | Technology |
| :--- | :--- |
| Runtime | Node.js 20 + TypeScript |
| Framework | Express 4 |
| Database | MongoDB Atlas + Mongoose |
| Auth | JWT + bcrypt |
| Email | Nodemailer (Mailtrap sandbox) |
| Validation | express-validator |
| Security | Helmet, CORS, express-rate-limit |

### DevOps
| Layer | Technology |
| :--- | :--- |
| Package manager | pnpm (workspaces) |
| Monorepo | pnpm workspace |
| Frontend hosting | Vercel |
| Backend hosting | Render |
| Database hosting | MongoDB Atlas |

---

## Architecture

### Monorepo Layout
