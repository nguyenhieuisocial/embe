const destinations = [
  { href: "/", mark: "⌂", label: "Hôm nay" },
  { href: "/me-bau", mark: "✓", label: "Mẹ Ngân" },
  { href: "/huong-dan", mark: "?", label: "Cách dùng" }
];

export default function FamilyNav() {
  return (
    <nav className="family-nav" aria-label="Điều hướng gia đình">
      {destinations.map((destination) => (
        <a href={destination.href} key={destination.href}>
          <span aria-hidden="true">{destination.mark}</span>
          {destination.label}
        </a>
      ))}
    </nav>
  );
}
