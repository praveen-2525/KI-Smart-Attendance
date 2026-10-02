"""
Attendance Calculation Engine
Configurable rules based on ERP logic observed.
"""
from dataclasses import dataclass, field
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from app import models
from app.models import AttendanceStatus


@dataclass
class AttendanceRule:
    """
    Configurable attendance calculation rule.
    Credited = PR + OD (configurable)
    Percentage = Credited / Total Eligible * 100
    ML/LL behavior is configurable.
    """
    credit_pr: bool = True
    credit_od: bool = True
    credit_ml: bool = False  # Configurable - not confirmed from ERP
    credit_ll: bool = False  # Configurable - not confirmed from ERP
    credit_le: bool = False   # Leave is NOT credited (reduces denominator or not)
    exclude_le_from_total: bool = False  # Whether LE reduces total eligible
    exclude_ml_from_total: bool = False
    target_percentage: float = 75.0


@dataclass
class SubjectAttendanceSummary:
    subject_id: int
    subject_name: str
    subject_code: str
    total_hours: int
    pr_hours: int
    od_hours: int
    ab_hours: int
    le_hours: int
    ml_hours: int
    ll_hours: int
    credited_hours: int
    eligible_hours: int
    percentage: float
    is_below_target: bool
    target_percentage: float


@dataclass
class OverallAttendanceSummary:
    total_hours: int
    pr_hours: int
    od_hours: int
    ab_hours: int
    le_hours: int
    ml_hours: int
    ll_hours: int
    credited_hours: int
    eligible_hours: int
    percentage: float
    is_below_target: bool
    target_percentage: float
    subjects: List[SubjectAttendanceSummary] = field(default_factory=list)


@dataclass
class PlannerResult:
    current_credited: int
    current_total: int
    current_percentage: float
    target_percentage: float
    # Classes needed to reach target
    classes_needed_to_reach_target: int
    can_reach_target: bool
    # Classes that can be missed while staying at target
    classes_can_miss: int
    already_at_target: bool
    message: str


@dataclass
class WhatIfResult:
    original_credited: int
    original_total: int
    original_percentage: float
    future_present: int
    future_od: int
    future_leave: int
    future_absent: int
    new_credited: int
    new_total: int
    new_percentage: float
    percentage_change: float
    reaches_target: bool
    target_percentage: float
    message: str


class AttendanceEngine:
    """Core attendance calculation engine."""

    def __init__(self, rule: Optional[AttendanceRule] = None):
        self.rule = rule or AttendanceRule()

    @classmethod
    def from_settings(cls, db: Session) -> "AttendanceEngine":
        """Load rules from database settings."""
        rule = AttendanceRule()
        settings_map = {s.key: s for s in db.query(models.Setting).all()}

        def get_bool(key, default):
            s = settings_map.get(key)
            return s.value.lower() == "true" if s else default

        def get_float(key, default):
            s = settings_map.get(key)
            return float(s.value) if s else default

        rule.credit_pr = get_bool("attendance.credit_pr", True)
        rule.credit_od = get_bool("attendance.credit_od", True)
        rule.credit_ml = get_bool("attendance.credit_ml", False)
        rule.credit_ll = get_bool("attendance.credit_ll", False)
        rule.credit_le = get_bool("attendance.credit_le", False)
        rule.exclude_le_from_total = get_bool("attendance.exclude_le_from_total", False)
        rule.exclude_ml_from_total = get_bool("attendance.exclude_ml_from_total", False)
        rule.target_percentage = get_float("attendance.target_percentage", 75.0)

        return cls(rule)

    def calculate_credited(self, pr: int, od: int, ml: int, ll: int, le: int) -> int:
        credited = 0
        if self.rule.credit_pr:
            credited += pr
        if self.rule.credit_od:
            credited += od
        if self.rule.credit_ml:
            credited += ml
        if self.rule.credit_ll:
            credited += ll
        if self.rule.credit_le:
            credited += le
        return credited

    def calculate_eligible(self, total: int, le: int, ml: int) -> int:
        eligible = total
        if self.rule.exclude_le_from_total:
            eligible -= le
        if self.rule.exclude_ml_from_total:
            eligible -= ml
        return max(eligible, 0)

    def calculate_percentage(self, credited: int, eligible: int) -> float:
        if eligible == 0:
            return 0.0
        return round((credited / eligible) * 100, 2)

    def compute_subject_summary(
        self,
        subject_id: int,
        subject_name: str,
        subject_code: str,
        records: List[models.AttendanceRecord]
    ) -> SubjectAttendanceSummary:
        pr = od = ab = le = ml = ll = 0
        for r in records:
            s = r.status
            if s == AttendanceStatus.PR:
                pr += 1
            elif s == AttendanceStatus.OD:
                od += 1
            elif s == AttendanceStatus.AB:
                ab += 1
            elif s == AttendanceStatus.LE:
                le += 1
            elif s == AttendanceStatus.ML:
                ml += 1
            elif s == AttendanceStatus.LL:
                ll += 1

        total = pr + od + ab + le + ml + ll
        credited = self.calculate_credited(pr, od, ml, ll, le)
        eligible = self.calculate_eligible(total, le, ml)
        percentage = self.calculate_percentage(credited, eligible)

        return SubjectAttendanceSummary(
            subject_id=subject_id,
            subject_name=subject_name,
            subject_code=subject_code,
            total_hours=total,
            pr_hours=pr,
            od_hours=od,
            ab_hours=ab,
            le_hours=le,
            ml_hours=ml,
            ll_hours=ll,
            credited_hours=credited,
            eligible_hours=eligible,
            percentage=percentage,
            is_below_target=percentage < self.rule.target_percentage,
            target_percentage=self.rule.target_percentage
        )

    def compute_overall_summary(
        self,
        db: Session,
        student_id: int,
        academic_year: Optional[str] = None,
        semester: Optional[int] = None
    ) -> OverallAttendanceSummary:
        query = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.student_id == student_id,
            models.AttendanceRecord.status != AttendanceStatus.NOT_MARKED
        )

        records = query.all()

        # Group by subject
        subject_records: Dict[int, List] = {}
        for r in records:
            if r.subject_id not in subject_records:
                subject_records[r.subject_id] = []
            subject_records[r.subject_id].append(r)

        # Compute per-subject
        subject_summaries = []
        total_pr = total_od = total_ab = total_le = total_ml = total_ll = 0

        for subj_id, recs in subject_records.items():
            subj = db.query(models.Subject).filter(models.Subject.id == subj_id).first()
            if not subj:
                continue
            summary = self.compute_subject_summary(subj_id, subj.name, subj.code, recs)
            subject_summaries.append(summary)
            total_pr += summary.pr_hours
            total_od += summary.od_hours
            total_ab += summary.ab_hours
            total_le += summary.le_hours
            total_ml += summary.ml_hours
            total_ll += summary.ll_hours

        total = total_pr + total_od + total_ab + total_le + total_ml + total_ll
        credited = self.calculate_credited(total_pr, total_od, total_ml, total_ll, total_le)
        eligible = self.calculate_eligible(total, total_le, total_ml)
        percentage = self.calculate_percentage(credited, eligible)

        return OverallAttendanceSummary(
            total_hours=total,
            pr_hours=total_pr,
            od_hours=total_od,
            ab_hours=total_ab,
            le_hours=total_le,
            ml_hours=total_ml,
            ll_hours=total_ll,
            credited_hours=credited,
            eligible_hours=eligible,
            percentage=percentage,
            is_below_target=percentage < self.rule.target_percentage,
            target_percentage=self.rule.target_percentage,
            subjects=subject_summaries
        )

    def calculate_classes_needed(
        self,
        current_credited: int,
        current_total: int,
        target_pct: Optional[float] = None
    ) -> PlannerResult:
        """
        Calculate how many more credited classes are needed to reach target.
        (current_credited + x) / (current_total + x) >= target/100
        => x >= (target * current_total - 100 * current_credited) / (100 - target)
        """
        target = target_pct or self.rule.target_percentage
        current_pct = self.calculate_percentage(current_credited, current_total)

        # Classes that can be missed while staying >= target
        # (current_credited) / (current_total + y) >= target/100
        # y <= (100 * current_credited / target) - current_total
        can_miss = 0
        if current_pct >= target:
            can_miss_float = (100 * current_credited / target) - current_total
            can_miss = max(0, int(can_miss_float))

        # Classes needed
        needed = 0
        already_at_target = current_pct >= target
        can_reach = True
        message = ""

        if not already_at_target:
            # x = ceil((target * total - 100 * credited) / (100 - target))
            if target >= 100:
                can_reach = False
                message = "Target is 100% - impossible to reach with any absences."
            else:
                import math
                needed_float = (target * current_total - 100 * current_credited) / (100 - target)
                needed = max(0, math.ceil(needed_float))
                message = f"You need {needed} more consecutive credited classes to reach {target}%."
        else:
            message = f"You are above {target}%. You can miss up to {can_miss} more classes."

        return PlannerResult(
            current_credited=current_credited,
            current_total=current_total,
            current_percentage=current_pct,
            target_percentage=target,
            classes_needed_to_reach_target=needed,
            can_reach_target=can_reach,
            classes_can_miss=can_miss,
            already_at_target=already_at_target,
            message=message
        )

    def what_if_simulation(
        self,
        current_credited: int,
        current_total: int,
        future_present: int,
        future_od: int,
        future_leave: int,
        future_absent: int,
        target_pct: Optional[float] = None
    ) -> WhatIfResult:
        target = target_pct or self.rule.target_percentage
        original_pct = self.calculate_percentage(current_credited, current_total)

        # Add future classes
        future_credited = self.calculate_credited(future_present, future_od, 0, 0, future_leave)
        future_total = future_present + future_od + future_leave + future_absent

        new_credited = current_credited + future_credited
        new_total = current_total + future_total
        new_eligible = self.calculate_eligible(new_total, future_leave, 0)
        new_credited_eligible = self.calculate_credited(
            current_credited + future_present,
            future_od, 0, 0, future_leave
        )

        # Simpler: treat it additively
        new_pct = self.calculate_percentage(new_credited, new_total)
        pct_change = round(new_pct - original_pct, 2)

        return WhatIfResult(
            original_credited=current_credited,
            original_total=current_total,
            original_percentage=original_pct,
            future_present=future_present,
            future_od=future_od,
            future_leave=future_leave,
            future_absent=future_absent,
            new_credited=new_credited,
            new_total=new_total,
            new_percentage=new_pct,
            percentage_change=pct_change,
            reaches_target=new_pct >= target,
            target_percentage=target,
            message=(
                f"After {future_present} Present, {future_od} OD, "
                f"{future_leave} Leave, {future_absent} Absent: "
                f"Attendance = {new_pct}% ({'+' if pct_change >= 0 else ''}{pct_change}%)"
            )
        )
