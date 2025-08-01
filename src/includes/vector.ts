import { InitializerListVariable } from "../initializer_list";
import { asResult } from "../interpreter";
import { CRuntime } from "../rt";
import * as common from "../shared/common";
import { InitIndexPointerVariable, Variable, variables, InitArithmeticVariable, Gen, MaybeUnboundVariable, ObjectType, InitValue, AbstractVariable, AbstractTemplatedClassType, ArithmeticVariable, PointerVariable } from "../variables";

interface VectorType<T extends ObjectType> extends AbstractTemplatedClassType<null, [T]> {
    readonly identifier: "vector",
}

type VectorVariable<T extends Variable> = AbstractVariable<VectorType<T["t"]>, VectorValue<T>>;

interface VectorValue<T extends Variable> extends InitValue<VectorVariable<T>> {
    members: {
        "_ptr": InitIndexPointerVariable<T>,
        "_sz": InitArithmeticVariable,
        "_cap": InitArithmeticVariable,
    }
}

export = {
    load(rt: CRuntime) {
        rt.defineStruct2("{global}", "vector", {
            numTemplateArgs: 1, factory: (dataItem: VectorType<ObjectType>) => {
                return [
                    {
                        name: "_ptr",
                        variable: variables.indexPointer<Variable>(variables.arrayMemory<Variable>(dataItem.templateSpec[0], []), 0, false, "SELF")
                    },
                    {
                        name: "_sz",
                        variable: variables.arithmetic("I32", 0, "SELF")
                    },
                    {
                        name: "_cap",
                        variable: variables.arithmetic("I32", 0, "SELF")
                    }
                ]
            }
        });
        const ctorHandler: common.OpHandler = {
            op: "o(_ctor)",
            type: "!ParamObject FUNCTION CLASS vector < ?0 > ( CLASS initializer_list < ?0 > )",
            *default(rt: CRuntime, _templateTypes: [], list: InitializerListVariable<ArithmeticVariable>): Gen<VectorVariable<Variable>> {
                const thisType = variables.classType("vector", list.t.templateSpec, null);
                const vec = yield* rt.defaultValue2(thisType, "SELF") as Gen<VectorVariable<Variable>>;
                const listmem = list.v.members._values.v.pointee;
                const memory = variables.arrayMemory<Variable>(thisType.templateSpec[0], []);
                for (let i = 0; i < listmem.values.length; i++) {
                    memory.values.push(variables.clone(rt.unbound(variables.arrayMember(listmem, i) as MaybeUnboundVariable), { array: memory, index: i }, false, rt.raiseException, true).v);
                }
                vec.v.members._ptr.v.pointee = memory;
                vec.v.members._cap.v.value = listmem.values.length;
                vec.v.members._sz.v.value = listmem.values.length;
                return vec;
            }
        };
        rt.explicitListInitTable["vector"] = (vec: VectorType<ObjectType>) => vec.templateSpec[0];
        rt.regFunc(ctorHandler.default, variables.classType("vector", [], null), ctorHandler.op, rt.typeSignature(ctorHandler.type), [-1]);
        function* _grow(rt: CRuntime, vec: VectorVariable<Variable>, amount: number): Gen<void> {
            const _sz: number = vec.v.members._sz.v.value;
            const _cap: number = vec.v.members._cap.v.value;
            if (_sz + amount > _cap) {
                let newcap = Math.max(vec.v.members._cap.v.value * 2, 8);
                while (_sz + amount > newcap) {
                    newcap *= 2;
                }
                const _pointeeType: ObjectType = vec.v.members._ptr.t.pointee;
                const newMemory = variables.arrayMemory<Variable>(_pointeeType, []);
                for (let i = 0; i < _sz; i++) {
                    newMemory.values.push(variables.clone(rt.unbound(variables.arrayMember(vec.v.members._ptr.v.pointee, i) as MaybeUnboundVariable), { array: newMemory, index: i }, false, rt.raiseException, true).v);
                }
                for (let i = _sz; i < newcap; i++) {
                    const defaultYield = rt.defaultValue2(_pointeeType, { array: newMemory, index: i });
                    const defaultVar = asResult(defaultYield) ?? (yield* defaultYield as Gen<Variable>);
                    newMemory.values.push(defaultVar.v);
                }
                vec.v.members._ptr.v.pointee = newMemory;
                vec.v.members._cap.v.value = newcap;
            }
            vec.v.members._sz.v.value += amount;

        }
        common.regOps(rt, [
            {
                op: "o(_[_])",
                type: "!ParamObject FUNCTION LREF ?0 ( CLREF CLASS vector < ?0 > I32 )",
                default(rt: CRuntime, _templateTypes: [], l: VectorVariable<Variable>, _idx: ArithmeticVariable): Variable {
                    const idx = rt.arithmeticValue(_idx);
                    if (idx < 0 || idx >= l.v.members._sz.v.value) {
                        rt.raiseException("vector::operator[]: index out of range error");
                    }
                    return variables.arrayMember(l.v.members._ptr.v.pointee, l.v.members._ptr.v.index + idx) as ArithmeticVariable;
                }
            },
        ]);
        common.regMemberFuncs(rt, "vector", [
            {
                op: "begin",
                type: "!ParamObject FUNCTION PTR ?0 ( CLREF CLASS vector < ?0 > )",
                default(_rt: CRuntime, _templateTypes: [], vec: VectorVariable<Variable>): InitIndexPointerVariable<Variable> {
                    return variables.indexPointer(vec.v.members._ptr.v.pointee, vec.v.members._ptr.v.index, false, null, false);
                }
            },
            {
                op: "end",
                type: "!ParamObject FUNCTION PTR ?0 ( CLREF CLASS vector < ?0 > )",
                default(_rt: CRuntime, _templateTypes: [], vec: VectorVariable<Variable>): InitIndexPointerVariable<Variable> {
                    return variables.indexPointer(vec.v.members._ptr.v.pointee, vec.v.members._ptr.v.index + vec.v.members._sz.v.value, false, null, false);
                }
            },
            {
                op: "push_back",
                type: "!ParamObject FUNCTION VOID ( LREF CLASS vector < ?0 > CLREF ?0 )",
                *default(rt: CRuntime, _templateTypes: [], vec: VectorVariable<Variable>, tail: Variable): Gen<"VOID"> {
                    yield* _grow(rt, vec, 1);
                    const index = vec.v.members._ptr.v.index + vec.v.members._sz.v.value - 1;
                    vec.v.members._ptr.v.pointee.values[index] = variables.clone(tail, { index, array: vec.v.members._ptr.v.pointee }, false, rt.raiseException, true).v;
                    return "VOID";
                }
            },
            {
                op: "resize",
                type: "!ParamObject FUNCTION VOID ( LREF CLASS vector < ?0 > I32 CLREF ?0 )",
                *default(rt: CRuntime, _templateTypes: [], vec: VectorVariable<Variable>, _size: ArithmeticVariable, tail: Variable): Gen<"VOID"> {
                    const size = rt.arithmeticValue(_size);
                    const oldSize = vec.v.members._sz.v.value;
                    if (size <= oldSize) {
                        vec.v.members._sz.v.value = size;
                    } else {
                        yield* _grow(rt, vec, size - oldSize);
                        for (let index = oldSize; index < size; index++) {
                            vec.v.members._ptr.v.pointee.values[index] = variables.clone(tail, { index, array: vec.v.members._ptr.v.pointee }, false, rt.raiseException, true).v;
                        }
                    }
                    return "VOID";
                }
            },
            {
                op: "pop_back",
                type: "!ParamObject FUNCTION VOID ( LREF CLASS vector < ?0 > )",
                default(rt: CRuntime, _templateTypes: [], vec: VectorVariable<Variable>): "VOID" {
                    if (vec.v.members._sz.v.value === 0) {
                        rt.raiseException("vector::pop_back(): vector is empty");
                    }
                    vec.v.members._sz.v.value--;
                    return "VOID";
                }
            },
            {
                op: "size",
                type: "!ParamObject FUNCTION I32 ( CLREF CLASS vector < ?0 > )",
                default(_rt: CRuntime, _templateTypes: [], vec: VectorVariable<Variable>): InitArithmeticVariable {
                    return variables.arithmetic("I32", vec.v.members._sz.v.value, null, false);
                }
            },
            {
                op: "erase",
                type: "!ParamObject FUNCTION PTR ?0 ( LREF CLASS vector < ?0 > PTR ?0 )",
                default(rt: CRuntime, _templateTypes: [], vec: VectorVariable<Variable>, _pos: PointerVariable<Variable>): InitIndexPointerVariable<Variable> {
                    const pos = variables.asInitIndexPointer(_pos) ?? rt.raiseException("vector::erase(): expected 'pos' to point to the vector element");
                    if (pos.v.pointee !== vec.v.members._ptr.v.pointee) {
                        rt.raiseException("vector::erase(): expected 'pos' to point to the vector element");
                    }
                    const _sz: number = --vec.v.members._sz.v.value;
                    for (let i = pos.v.index; i < _sz; i++) {
                        pos.v.pointee.values[i] = { lvHolder: pos.v.pointee.values[i], ...pos.v.pointee.values[i + 1] };
                    }
                    return pos;
                }
            },
            {
                op: "insert",
                type: "!ParamObject FUNCTION PTR ?0 ( LREF CLASS vector < ?0 > PTR ?0 CLREF ?0 )",
                *default(rt: CRuntime, _templateTypes: [], vec: VectorVariable<Variable>, _pos: PointerVariable<Variable>, tail: Variable): Gen<InitIndexPointerVariable<Variable>> {
                    const pos = variables.asInitIndexPointer(_pos) ?? rt.raiseException("vector::insert(): expected 'pos' to point to the vector element");
                    if (pos.v.pointee !== vec.v.members._ptr.v.pointee) {
                        rt.raiseException("vector::insert(): expected 'pos' to point to the vector element");
                    }
                    yield* _grow(rt, vec, 1);
                    const pointee = vec.v.members._ptr.v.pointee;
                    pos.v.pointee = pointee;
                    const _sz: number = vec.v.members._sz.v.value;
                    for (let i = _sz - 2; i >= Math.max(pos.v.index, 0); i--) {
                        pointee.values[i + 1] = { lvHolder: pointee.values[i + 1], ...pointee.values[i] };
                    }
                    pointee.values[pos.v.index] = variables.clone(tail, { index: pos.v.index, array: pointee }, false, rt.raiseException, true).v;
                    return pos;
                }
            },
            {
                op: "erase",
                type: "!ParamObject FUNCTION PTR ?0 ( LREF CLASS vector < ?0 > PTR ?0 PTR ?0 )",
                default(rt: CRuntime, _templateTypes: [], vec: VectorVariable<Variable>, _first: PointerVariable<Variable>, _last: PointerVariable<Variable>): InitIndexPointerVariable<Variable> {
                    const first = variables.asInitIndexPointer(_first) ?? rt.raiseException("vector::erase(): expected 'first' to point to the vector element");
                    const last = variables.asInitIndexPointer(_last) ?? rt.raiseException("vector::erase(): expected 'last' to point to the vector element");
                    if (first.v.pointee !== vec.v.members._ptr.v.pointee) {
                        rt.raiseException("vector::erase(): expected 'first' to point to the vector element");
                    }
                    if (last.v.pointee !== vec.v.members._ptr.v.pointee) {
                        rt.raiseException("vector::erase(): expected 'last' to point to the vector element");
                    }
                    const diff = Math.max(0, last.v.index - first.v.index);
                    const _sz: number = (vec.v.members._sz.v.value -= diff);
                    for (let i = first.v.index; i < _sz; i++) {
                        first.v.pointee.values[i] = { lvHolder: first.v.pointee.values[i], ...first.v.pointee.values[i + diff] };
                    }
                    return first;
                }
            },
            {
                op: "clear",
                type: "!ParamObject FUNCTION VOID ( LREF CLASS vector < ?0 > )",
                default(_rt: CRuntime, _templateTypes: [], vec: VectorVariable<Variable>): "VOID" {
                    vec.v.members._sz.v.value = 0;
                    return "VOID";
                }
            },
        ])
    }
};
