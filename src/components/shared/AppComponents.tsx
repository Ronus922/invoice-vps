import React, { useState } from "react";

// --- 0. Internal Utilities (No external deps) ---

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

// --- 1. Base Components (Re-implemented for stability) ---

// Badge Component
const Badge = ({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "secondary" }) => {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variant === "secondary" ? "border-transparent bg-gray-100 text-gray-900 hover:bg-gray-100/80 dark:bg-gray-800 dark:text-gray-50" : "border-transparent bg-gray-900 text-gray-50 hover:bg-gray-900/80 dark:bg-gray-50 dark:text-gray-900",
        className
      )}
      {...props}
    />
  );
};

// Button Component (Native implementation without Slot)
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variant === "primary" && "bg-slate-900 text-white hover:bg-slate-900/90 h-10 px-4 py-2 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-50/90",
          variant === "ghost" && "hover:bg-slate-100 text-slate-900",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

// --- 2. Layout Primitives ---

interface AppSectionProps extends React.HTMLAttributes<HTMLElement> {
  fullWidth?: boolean;
  prose?: boolean;
}

export const AppSection = React.forwardRef<HTMLElement, AppSectionProps>(
  ({ className, children, fullWidth = false, prose = false, ...props }, ref) => {
    return (
      <section
        ref={ref}
        className={cn(
          "w-full py-12 md:py-24 lg:py-32 relative overflow-hidden animate-in fade-in duration-700 slide-in-from-bottom-4",
          !fullWidth && "container mx-auto px-4 md:px-6",
          prose && "prose prose-gray dark:prose-invert max-w-3xl mx-auto",
          className
        )}
        {...props}
      >
        {children}
      </section>
    );
  }
);
AppSection.displayName = "AppSection";

interface AppGridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: 1 | 2 | 3 | 4;
}

export const AppGrid = React.forwardRef<HTMLDivElement, AppGridProps>(
  ({ className, children, cols = 3, ...props }, ref) => {
    const gridCols = {
      1: "grid-cols-1",
      2: "grid-cols-1 md:grid-cols-2",
      3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
      4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
    };

    return (
      <div
        ref={ref}
        className={cn("grid gap-6 md:gap-8", gridCols[cols], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AppGrid.displayName = "AppGrid";

interface AppFlexProps extends React.HTMLAttributes<HTMLDivElement> {
  between?: boolean;
  center?: boolean;
}

export const AppFlex = React.forwardRef<HTMLDivElement, AppFlexProps>(
  ({ className, children, between, center, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-4",
          between && "justify-between w-full",
          center && "justify-center",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AppFlex.displayName = "AppFlex";

// --- 3. Typography & Headers ---

interface SectionHeaderProps {
  badge?: string;
  title: string;
  description?: string;
  align?: "left" | "center" | "right";
  className?: string;
}

export const SectionHeader = ({
  badge,
  title,
  description,
  align = "center",
  className,
}: SectionHeaderProps) => {
  const alignClass = {
    left: "text-left items-start",
    center: "text-center items-center mx-auto",
    right: "text-right items-end ml-auto",
  };

  return (
    <div className={cn("flex flex-col gap-3 mb-12", alignClass[align], className)}>
      {badge && (
        <Badge variant="secondary" className="w-fit mb-2">
          {badge}
        </Badge>
      )}
      <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
        {title}
      </h2>
      {description && (
        <p className="max-w-[700px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400">
          {description}
        </p>
      )}
    </div>
  );
};

// --- 4. Interactive Elements ---

interface AppButtonProps extends ButtonProps {
  isLoading?: boolean;
  pulse?: boolean;
}

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ className, isLoading, pulse, children, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        className={cn(
          "relative transition-all duration-300 transform",
          "active:scale-95 hover:scale-105",
          pulse && "animate-pulse shadow-[0_0_20px_rgba(59,130,246,0.5)]",
          className
        )}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading ? (
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </Button>
    );
  }
);
AppButton.displayName = "AppButton";

// --- 5. Containers with Special Effects ---

export const AppList = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLUListElement>) => {
  return (
    <ul className={cn("flex flex-col gap-2", className)} {...props}>
      {children}
    </ul>
  );
};

interface AppCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

export const AppCard = React.forwardRef<HTMLDivElement, AppCardProps>(
  ({ className, children, hoverEffect = true, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border bg-card text-card-foreground shadow-sm p-6 transition-all duration-300",
          hoverEffect && "hover:shadow-lg hover:border-blue-500/20 hover:-translate-y-1",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AppCard.displayName = "AppCard";

// --- 6. Media ---

interface AppImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  containerClassName?: string;
}

export const AppImage = ({ containerClassName, className, alt, ...props }: AppImageProps) => {
  const [isLoading, setLoading] = useState(true);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800",
        containerClassName
      )}
    >
      <img
        className={cn(
          "duration-700 ease-in-out w-full h-auto object-cover",
          isLoading ? "scale-110 blur-2xl grayscale" : "scale-100 blur-0 grayscale-0",
          className
        )}
        alt={alt}
        onLoad={() => setLoading(false)}
        {...props}
      />
    </div>
  );
};

// --- 7. DEFAULT EXPORT (DEMO/PREVIEW) ---

export default function AppComponentsPreview() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-8 font-sans text-gray-900 dark:text-gray-100">
      <div className="max-w-5xl mx-auto space-y-16">
        <SectionHeader
          badge="Design System v2.2"
          title="Antigravity Components"
          description="A standalone showcase of the architectural building blocks. No external dependencies required."
          align="left"
        />

        <section className="space-y-4">
          <h3 className="text-xl font-bold border-b pb-2 mb-4">Interactive Buttons</h3>
          <AppFlex>
            <AppButton>Primary Action</AppButton>
            <AppButton variant="ghost">Ghost Action</AppButton>
            <AppButton isLoading>Processing...</AppButton>
            <AppButton pulse>Pulse Effect</AppButton>
          </AppFlex>
        </section>

        <section className="space-y-4">
          <h3 className="text-xl font-bold border-b pb-2 mb-4">Grid System & Smart Cards</h3>
          <AppGrid cols={3}>
            <AppCard>
              <h4 className="font-bold text-lg mb-2">Interactive Card</h4>
              <p className="text-gray-500 text-sm">Hover over me to see the physics-based lift effect.</p>
            </AppCard>
            <AppCard hoverEffect={false}>
              <h4 className="font-bold text-lg mb-2">Static Card</h4>
              <p className="text-gray-500 text-sm">Used for information display where interaction isn't required.</p>
            </AppCard>
            <AppCard>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-600">⚡</div>
                <h4 className="font-bold text-lg">Feature</h4>
              </div>
              <p className="text-gray-500 text-sm">Composite card example with icon and structure.</p>
            </AppCard>
          </AppGrid>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-4">
            <h3 className="text-xl font-bold border-b pb-2 mb-4">AppList Container</h3>
            <AppCard hoverEffect={false} className="bg-gray-50 dark:bg-gray-900">
              <AppList>
                <div className="p-3 bg-white dark:bg-gray-800 rounded border shadow-sm flex justify-between">
                  <span>List Item 1</span>
                  <Badge variant="secondary">New</Badge>
                </div>
                <div className="p-3 bg-white dark:bg-gray-800 rounded border shadow-sm">List Item 2</div>
                <div className="p-3 bg-white dark:bg-gray-800 rounded border shadow-sm">List Item 3</div>
              </AppList>
            </AppCard>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-bold border-b pb-2 mb-4">Image Wrapper</h3>
            <AppImage
              src="https://placehold.co/600x400/222/white?text=Demo+Image"
              alt="Demo Image"
              containerClassName="aspect-video"
            />
          </section>
        </div>
      </div>
    </div>
  );
}
