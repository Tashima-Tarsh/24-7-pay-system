/**
 * @youpi/ui - UI Component Library
 *
 * Phase 0: Design System Foundation
 *
 * Exports all components:
 *   - Button
 *   - Card (Card, CardHeader, CardTitle, CardContent, CardFooter, CardTitleWithActions)
 *   - Badge
 *   - Skeleton (Skeleton, SkeletonLine, SkeletonCircle)
 *   - Input
 *   - cn (utility for className composition)
 */

export {
  Button,
  type ButtonProps,
} from "./components/Button.tsx";

export {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardTitleWithActions,
  type CardProps,
} from "./components/Card.tsx";

export {
  Badge,
  type BadgeProps,
} from "./components/Badge.tsx";

export {
  Skeleton,
  SkeletonLine,
  SkeletonCircle,
  type SkeletonProps,
} from "./components/Skeleton.tsx";

export {
  Input,
  type InputProps,
} from "./components/Input.tsx";

export { cn } from "./components/utils/cn.ts";
