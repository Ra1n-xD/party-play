import React, { useMemo } from 'react';

const PARTICLE_COUNT = 22;

interface ParticleStyle {
  left: string;
  bottom: string;
  width: string;
  height: string;
  opacity: number;
  animationDuration: string;
  animationDelay: string;
}

function generateParticles(): ParticleStyle[] {
  const particles: ParticleStyle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const size = 2 + Math.random() * 4;
    particles.push({
      left: `${Math.random() * 100}%`,
      bottom: `${-10 - Math.random() * 20}%`,
      width: `${size}px`,
      height: `${size}px`,
      opacity: 0.15 + Math.random() * 0.45,
      animationDuration: `${18 + Math.random() * 25}s`,
      animationDelay: `${-Math.random() * 30}s`,
    });
  }
  return particles;
}

const BackgroundParticles: React.FC = () => {
  const particles = useMemo(() => generateParticles(), []);

  return (
    <div className="particles-bg" aria-hidden="true">
      {particles.map((style, i) => (
        <div key={i} className="particle" style={style} />
      ))}
    </div>
  );
};

export default BackgroundParticles;
