"""
HWP 수식 너비 자동 조정 (Paser_Exam_pj 포팅)

수식 개체를 선택 → Enter(수식속성 대화상자) → Esc(닫기, 너비 자동 재계산)
"""

import sys
import time
import os


def check_dependencies():
    """의존성 체크"""
    missing = []
    try:
        import win32com.client  # noqa: F401
    except ImportError:
        missing.append('pywin32')

    if missing:
        return {
            "success": False,
            "error": f"Missing packages: {', '.join(missing)}. Install: pip install {' '.join(missing)}"
        }
    return None


def collect_equations(hwp, use_pyhwpx):
    """수식 컨트롤 수집"""
    equations = []
    if use_pyhwpx:
        for ctrl in hwp.ctrl_list:
            try:
                if hasattr(ctrl, 'UserDesc') and ctrl.UserDesc == '수식':
                    equations.append(ctrl)
            except Exception:
                continue
    else:
        ctrl = hwp.HeadCtrl
        while ctrl:
            try:
                if ctrl.CtrlID == 'eqed':
                    equations.append(ctrl)
            except Exception:
                pass
            try:
                ctrl = ctrl.Next
            except Exception:
                break
    return equations


def activate_hwp_window(shell):
    """한글 프로그램 창을 포그라운드로 활성화"""
    for title in ["한글", "Hangul", "HWP"]:
        try:
            shell.AppActivate(title)
            time.sleep(0.3)
            return True
        except Exception:
            continue
    return False


def process_equation(hwp, ctrl, shell, delay, index, total, use_pyhwpx):
    """수식 속성 대화상자를 통한 너비 자동 조정"""
    try:
        if use_pyhwpx:
            hwp.select_ctrl(ctrl)
        else:
            pos = ctrl.GetAnchorPos(0)
            hwp.SetPosBySet(pos)
            hwp.SelectCtrlFront()
        time.sleep(0.1)

        shell.SendKeys("{ENTER}", 0)
        time.sleep(delay)

        shell.SendKeys("{ESC}", 0)
        time.sleep(0.2)

        return True
    except Exception as e:
        sys.stderr.write(f"  [{index + 1}/{total}] 오류: {str(e)}\n")
        try:
            shell.SendKeys("{ESC}{ESC}{ESC}", 0)
            time.sleep(0.3)
        except Exception:
            pass
        return False


def fix_equation_widths(hwpx_path, output_path=None, delay=0.5, limit=0):
    """메인 처리 함수"""
    dep_error = check_dependencies()
    if dep_error:
        return dep_error

    import win32com.client

    abs_path = os.path.abspath(hwpx_path)
    if not os.path.exists(abs_path):
        return {"success": False, "error": f"파일을 찾을 수 없습니다: {abs_path}"}

    if not output_path:
        name, ext = os.path.splitext(abs_path)
        output_path = f"{name}_fixed{ext}"

    shell = win32com.client.Dispatch("WScript.Shell")
    hwp = None
    use_pyhwpx = True
    start_time = time.time()

    try:
        sys.stderr.write("[fix-eq] 한글 프로그램 초기화 중...\n")
        try:
            from pyhwpx import Hwp
            hwp = Hwp(visible=True)
        except Exception:
            use_pyhwpx = False
            hwp = win32com.client.gencache.EnsureDispatch("HWPFrame.HwpObject.1")
            hwp.XHwpWindows.Item(0).Visible = True
            try:
                hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
            except Exception:
                pass

        if use_pyhwpx:
            hwp.open(abs_path)
        else:
            hwp.Open(abs_path)
        time.sleep(3)

        activate_hwp_window(shell)
        shell.SendKeys("^{HOME}", 0)
        time.sleep(1)

        equations = collect_equations(hwp, use_pyhwpx)
        total_found = len(equations)

        if limit > 0:
            equations = equations[:limit]

        total = len(equations)
        if total == 0:
            if use_pyhwpx:
                hwp.save_as(output_path)
            else:
                hwp.SaveAs(output_path)
            return {
                "success": True,
                "total_equations": total_found,
                "processed": 0,
                "failed": 0,
                "output_path": output_path,
                "elapsed_seconds": round(time.time() - start_time, 1),
            }

        activate_hwp_window(shell)
        processed = 0
        failed = 0
        warmup_count = 20

        for i, eq_ctrl in enumerate(equations):
            if i % 10 == 0:
                activate_hwp_window(shell)
            current_delay = delay * 2 if i < warmup_count else delay
            if process_equation(hwp, eq_ctrl, shell, current_delay, i, total, use_pyhwpx):
                processed += 1
            else:
                failed += 1

        if use_pyhwpx:
            hwp.save_as(output_path)
        else:
            hwp.SaveAs(output_path)

        elapsed = round(time.time() - start_time, 1)
        return {
            "success": True,
            "total_equations": total_found,
            "processed": processed,
            "failed": failed,
            "output_path": output_path,
            "elapsed_seconds": elapsed,
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "elapsed_seconds": round(time.time() - start_time, 1),
        }
    finally:
        try:
            if hwp:
                if use_pyhwpx:
                    hwp.quit()
                else:
                    hwp.Quit()
        except Exception:
            pass
