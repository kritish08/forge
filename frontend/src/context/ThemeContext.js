import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    // 1. Initialize state from localStorage or default to system.
    // Wrapped because localStorage throws outright in some privacy modes rather
    // than returning null. The same key is read by the pre-paint script in
    // public/index.html — keep them in sync.
    const [theme, setTheme] = useState(() => {
        try {
            return localStorage.getItem('forge-theme') || 'system';
        } catch {
            return 'system';
        }
    });

    // 2. Apply theme effect
    useEffect(() => {
        const root = window.document.documentElement;

        const resolved = theme === 'system'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : theme;

        root.classList.remove('light', 'dark');
        root.classList.add(resolved);
        // Keep the canvas/scrollbar/form-control palette in step with the class,
        // so a toggle doesn't leave the browser chrome on the old theme.
        root.style.colorScheme = resolved;

        try {
            localStorage.setItem('forge-theme', theme);
        } catch {
            /* storage blocked — the theme still applies for this session */
        }
    }, [theme]);

    // 3. Listen for system theme changes if set to system
    useEffect(() => {
        if (theme !== 'system') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e) => {
            const root = window.document.documentElement;
            const resolved = e.matches ? 'dark' : 'light';
            root.classList.remove('light', 'dark');
            root.classList.add(resolved);
            root.style.colorScheme = resolved;
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
