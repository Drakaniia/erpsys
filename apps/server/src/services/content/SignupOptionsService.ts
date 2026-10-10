import type { AcademicYearOption } from "../../models/AcademicYearModel.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import {
  DepartmentService,
  type DepartmentView,
} from "../departments/DepartmentService.js";

export type SignupOptions = {
  academicYears: Array<{
    id: string;
    label: string;
    semesterLabel: string;
    isActive: boolean;
  }>;
  departments: DepartmentView[];
};

export class SignupOptionsService {
  static async get(): Promise<SignupOptions> {
    const [years, departments] = await Promise.all([
      AcademicYearService.options(),
      DepartmentService.listActive(),
    ]);
    return {
      academicYears: years.map((year: AcademicYearOption) => ({
        id: String(year._id),
        label: year.label,
        semesterLabel: year.semesterLabel,
        isActive: !!year.isActive,
      })),
      departments,
    };
  }
}
