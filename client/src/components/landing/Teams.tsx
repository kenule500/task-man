import { KeyRound, Mail, UserMinus } from 'lucide-react';

// The five system roles shipped with every workspace (server/src/config/permissions.ts)
const SYSTEM_ROLES = ['Product Owner', 'Scrum Master', 'Developer', 'Team Member', 'Viewer'];

const STEPS = [
  {
    icon: Mail,
    title: 'Invite by email',
    desc: 'Pick a role when you send the invitation. People accept it from the link in their inbox.',
  },
  {
    icon: KeyRound,
    title: 'Create custom roles',
    desc: 'Combine permissions for tasks, projects, reports, members and settings into a role that fits your team.',
  },
  {
    icon: UserMinus,
    title: 'Change access any time',
    desc: 'Update a role or remove a member from the team page. Regenerate the invite code if it leaks.',
  },
];

const Teams = () => (
  <section id="teams" aria-labelledby="teams-heading" className="scroll-mt-20 border-t border-slate-100 bg-white py-16 md:py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2 md:gap-12">
        <div>
          <p className="mb-6 inline-block rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Teams and roles
          </p>
          <h2 id="teams-heading" className="mb-6 text-balance text-3xl font-bold leading-tight text-slate-900 md:text-4xl">
            Everyone sees what they need, and nothing more.
          </h2>
          <p className="mb-6 text-lg text-slate-600">
            Every workspace comes with five roles. Pages and actions a role does not allow are hidden, and the server
            enforces the same rules.
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Built-in roles">
            {SYSTEM_ROLES.map((role) => (
              <li key={role} className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700">
                {role}
              </li>
            ))}
            <li className="rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700">
              + your own roles
            </li>
          </ul>
        </div>

        <ul className="space-y-4">
          {STEPS.map(({ icon: Icon, title, desc }) => (
            <li key={title} className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
              <div aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary">
                <Icon className="size-5" />
              </div>
              <div>
                <h3 className="mb-1 font-bold text-slate-900">{title}</h3>
                <p className="text-sm text-slate-600">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);

export default Teams;
