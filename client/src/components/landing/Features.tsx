import { CheckCircle2, Shield, BarChart3 } from 'lucide-react';

const Features = () => {
  const features = [
    {
      icon: <CheckCircle2 className="w-6 h-6" />,
      title: 'Task Management',
      desc: 'Create, update, and delete tasks with ease. Keep track of deadlines and priorities in one place.',
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: 'Real-time Analytics',
      desc: "Visualize your progress with quick stat cards. See what's in progress, completed, or overdue at a glance.",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: 'Secure Sessions',
      desc: 'Your data is protected with JWT authentication and secure session management across all your devices.',
    },
  ];

  return (
    <section id="features" className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Everything you need to stay organized</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">TaskMan provides a minimal, distraction-free environment so you can focus on what matters most.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <div key={i} className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-50 text-primary rounded-xl flex items-center justify-center mb-6">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-500">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;