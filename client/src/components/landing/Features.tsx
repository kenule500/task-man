import { GitBranch, LayoutGrid, MessageSquare, ShieldCheck, Smartphone, Users } from 'lucide-react';

const FEATURES = [
  {
    icon: LayoutGrid,
    title: 'Four views of the same tasks',
    desc: 'Switch between a list with inline editing, a kanban board, a month calendar and a timeline. Edit in any of them and the others stay in sync.',
  },
  {
    icon: GitBranch,
    title: 'Dependencies and conflicts',
    desc: 'Mark tasks that must finish first. The timeline draws the links and flags a task that starts before its prerequisite is due.',
  },
  {
    icon: Users,
    title: 'Roles and permissions',
    desc: 'Invite people by email with a role. Five built-in roles, plus custom roles with exactly the permissions you choose.',
  },
  {
    icon: MessageSquare,
    title: 'Comments and attachments',
    desc: 'Discuss a task where the work lives and attach files to it, so context does not get lost in chat.',
  },
  {
    icon: Smartphone,
    title: 'Installable on any device',
    desc: 'Add TaskMan to your home screen or desktop. Layouts adapt to phones, and the app tells you when you are offline.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure by default',
    desc: 'Verified email addresses, password reset by email, and a password change that signs out your other devices.',
  },
];

const Features = () => (
  <section id="features" aria-labelledby="features-heading" className="scroll-mt-20 bg-background py-16 md:py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="mb-12 text-center md:mb-16">
        <h2 id="features-heading" className="mb-4 text-balance text-3xl font-bold text-gray-900 md:text-4xl">
          Everything you need to stay organized
        </h2>
        <p className="mx-auto max-w-2xl text-lg text-gray-600">
          A focused toolset for planning, tracking and sharing work, without the clutter.
        </p>
      </div>

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <li
            key={title}
            className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md sm:p-8"
          >
            <div aria-hidden className="mb-5 flex size-12 items-center justify-center rounded-xl bg-blue-50 text-primary">
              <Icon className="size-6" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900">{title}</h3>
            <p className="text-gray-600">{desc}</p>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default Features;
