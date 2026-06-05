import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  COURSE_LIST,
  DEFAULT_COURSE_ID,
  getCourse,
  isValidCourseId,
  type Course,
} from '../config/courses';

interface CourseContextValue {
  courseId: string;
  course: Course;
  courses: Course[];
  setCourse: (id: string) => void;
}

const CourseContext = createContext<CourseContextValue | undefined>(undefined);

const STORAGE_KEY = 'tic.course';

/**
 * Parcours sélectionné, global et persistant.
 * Source de vérité : le paramètre d'URL `?course=`. À défaut, on retombe sur
 * le dernier choix mémorisé (localStorage), puis sur le parcours par défaut.
 */
export function CourseProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCourse = searchParams.get('course');

  const stored =
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

  const courseId = isValidCourseId(urlCourse)
    ? (urlCourse as string)
    : isValidCourseId(stored)
      ? (stored as string)
      : DEFAULT_COURSE_ID;

  const value = useMemo<CourseContextValue>(() => {
    return {
      courseId,
      course: getCourse(courseId) as Course,
      courses: COURSE_LIST,
      setCourse(id: string) {
        if (!isValidCourseId(id)) return;
        try {
          localStorage.setItem(STORAGE_KEY, id);
        } catch {
          /* localStorage indisponible : on ignore */
        }
        const next = new URLSearchParams(searchParams);
        next.set('course', id);
        setSearchParams(next);
      },
    };
    // searchParams change à chaque navigation -> setCourse reste à jour
  }, [courseId, searchParams, setSearchParams]);

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCourse(): CourseContextValue {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error('useCourse doit être utilisé dans <CourseProvider>');
  return ctx;
}
