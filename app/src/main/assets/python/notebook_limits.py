"""Optional OS process limits. These do not sandbox trusted notebook code."""
import os
import sys

_job_handle = None


def apply_memory_limit(megabytes, cpu_percent=0):
    global _job_handle
    mb = int(megabytes or 0)
    if not 0 <= mb <= 1048576 or 0 < mb < 64:
        raise ValueError("Notebook memory must be 0 or at least 64 MiB")
    cpu = int(cpu_percent or 0)
    if not 0 <= cpu <= 100:
        raise ValueError("Notebook CPU must be between 0 and 100 percent")
    result = {"memoryMb": mb, "enforced": False, "cpuPercent": cpu, "cpuEnforced": False}
    if not mb and not cpu:
        return result
    try:
        size = mb * 1024 * 1024
        if sys.platform == 'win32':
            import ctypes
            from ctypes import wintypes as w
            ptr = ctypes.c_size_t

            class Basic(ctypes.Structure):
                _fields_ = [('ProcessUserTimeLimit', ctypes.c_int64), ('JobUserTimeLimit', ctypes.c_int64), ('LimitFlags', w.DWORD), ('MinimumWorkingSetSize', ptr), ('MaximumWorkingSetSize', ptr), ('ActiveProcessLimit', w.DWORD), ('Affinity', ptr), ('PriorityClass', w.DWORD), ('SchedulingClass', w.DWORD)]

            class IO(ctypes.Structure):
                _fields_ = [(name, ctypes.c_uint64) for name in ['ReadOperationCount', 'WriteOperationCount', 'OtherOperationCount', 'ReadTransferCount', 'WriteTransferCount', 'OtherTransferCount']]

            class Extended(ctypes.Structure):
                _fields_ = [('BasicLimitInformation', Basic), ('IoInfo', IO), ('ProcessMemoryLimit', ptr), ('JobMemoryLimit', ptr), ('PeakProcessMemoryUsed', ptr), ('PeakJobMemoryUsed', ptr)]

            api = ctypes.WinDLL('kernel32', use_last_error=True)
            api.CreateJobObjectW.argtypes = [ctypes.c_void_p, w.LPCWSTR]
            api.CreateJobObjectW.restype = w.HANDLE
            api.GetCurrentProcess.restype = w.HANDLE
            api.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD]
            api.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
            api.CloseHandle.argtypes = [w.HANDLE]
            handle = api.CreateJobObjectW(None, None)
            limits = Extended()
            limits.BasicLimitInformation.LimitFlags = (0x100 | 0x200) if mb else 0
            limits.ProcessMemoryLimit = limits.JobMemoryLimit = size
            if not handle or mb and not api.SetInformationJobObject(handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)) or not api.AssignProcessToJobObject(handle, api.GetCurrentProcess()):
                error = ctypes.WinError(ctypes.get_last_error())
                if handle:
                    api.CloseHandle(handle)
                raise error
            _job_handle = handle
            if cpu:
                class CPU(ctypes.Structure):
                    _fields_ = [('ControlFlags', w.DWORD), ('CpuRate', w.DWORD)]
                rate = CPU(0x1 | 0x4, cpu * 100)
                if not api.SetInformationJobObject(handle, 15, ctypes.byref(rate), ctypes.sizeof(rate)):
                    result['cpuError'] = str(ctypes.WinError(ctypes.get_last_error()))
                else:
                    result['cpuEnforced'] = True
            result['mechanism'] = 'Windows Job Object: process and child-job committed memory'
        elif sys.platform.startswith('linux'):
            import resource
            if mb:
                resource.setrlimit(resource.RLIMIT_AS, (size, size))
            if cpu:
                result['cpuError'] = 'CPU quota requires a delegated cgroup; unavailable in this local runner'
            result['mechanism'] = 'RLIMIT_AS: virtual address space per process'
        else:
            raise RuntimeError('A hard memory limit is not available on this platform')
        result['enforced'] = bool(mb)
    except Exception as error:
        result['error'] = str(error)
    return result
