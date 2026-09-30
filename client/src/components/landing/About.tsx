import { Rocket, Target, Users } from 'lucide-react';

const About = () => {
  const stats = [
    { value: '10k+', label: 'Active users' },
    { value: '1M+', label: 'Tasks completed' },
    { value: '99.9%', label: 'Uptime' },
  ];

  const values = [
    { icon: <Rocket className="w-5 h-5" />, title: 'Ship faster', desc: 'Reduce friction between idea and done.' },
    { icon: <Target className="w-5 h-5" />, title: 'Stay focused', desc: 'Minimal interfaces, zero distractions.' },
    { icon: <Users className="w-5 h-5" />, title: 'Build together', desc: 'Collaboration that feels effortless.' },
  ];

  return (
    <section id="about" className="py-24 bg-background border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
          <div>
            <span className="inline-block py-1 px-3 rounded-full bg-blue-50 text-primary font-semibold tracking-wide text-xs mb-6 border border-blue-100">
              OUR MISSION
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 leading-tight">
              Built by builders, for builders.
            </h2>
            <p className="text-lg text-gray-500 mb-6">
              TaskMan started as a frustration with cluttered, overwhelming productivity tools. We wanted something simple, fast, and beautiful — that just works.
            </p>
            <p className="text-gray-500 mb-8">
              Today, thousands of developers, designers, and teams use TaskMan to organize their work, ship faster, and stay focused on what actually matters.
            </p>

            <div className="grid grid-cols-3 gap-6">
              {stats.map((stat, i) => (
                <div key={i}>
                  <div className="text-3xl font-bold text-primary mb-1">{stat.value}</div>
                  <div className="text-xs text-gray-500">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {values.map((value, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-50 text-primary rounded-xl flex items-center justify-center flex-shrink-0">
                  {value.icon}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{value.title}</h3>
                  <p className="text-sm text-gray-500">{value.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;