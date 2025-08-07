from sqlalchemy import (Column, Integer, String, Text, Boolean, 
                        ForeignKey, DateTime, UniqueConstraint)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, declarative_base
from database import Base
class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    model_path = Column(String(255))

    # Связи "один-ко-многим"
    components = relationship("Component", back_populates="product", cascade="all, delete-orphan")
    workstations = relationship("Workstation", back_populates="product", cascade="all, delete-orphan")
    assembly_plans = relationship("AssemblyPlan", back_populates="product", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Product(id={self.id}, name='{self.name}')>"

class Component(Base):
    __tablename__ = "components"

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    mesh_id = Column(String(100), nullable=False)

    # Связь "многие-к-одному"
    product = relationship("Product", back_populates="components")

    # Уникальность меша в рамках одного продукта
    __table_args__ = (UniqueConstraint('product_id', 'mesh_id', name='_product_mesh_uc'),)
    
    def __repr__(self):
        return f"<Component(id={self.id}, name='{self.name}', mesh_id='{self.mesh_id}')>"

class Workstation(Base):
    __tablename__ = "workstations"

    id = Column(Integer, primary_key=True)
    computer_name = Column(String(255), unique=True, nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    description = Column(Text) # description added
    # description is missing
    # Связь "многие-к-одному"
    product = relationship("Product", back_populates="workstations")

    def __repr__(self):
        return f"<Workstation(id={self.id}, computer_name='{self.computer_name}', product_id={self.product_id})>"

class AssemblyPlan(Base):
    __tablename__ = "assembly_plans"

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    

    # Связь "многие-к-одному"
    product = relationship("Product", back_populates="assembly_plans")
    # Связь "один-ко-многим"
    steps = relationship("AssemblyStep", back_populates="plan", cascade="all, delete-orphan", passive_deletes=True, order_by="AssemblyStep.step_number")

    def __repr__(self):
        return f"<AssemblyPlan(id={self.id}, name='{self.name}')>"

class AssemblyStep(Base):
    __tablename__ = "assembly_steps"

    id = Column(Integer, primary_key=True)
    plan_id = Column(Integer, ForeignKey("assembly_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    component_id = Column(Integer, ForeignKey("components.id", ondelete="RESTRICT"), nullable=False)
    step_number = Column(Integer, nullable=False)
    action_type = Column(String(50), default='tighten', nullable=False)

    # Связи "многие-к-одному"
    plan = relationship("AssemblyPlan", back_populates="steps")
    component = relationship("Component")

    # Номер шага должен быть уникальным в рамках одного плана
    __table_args__ = (UniqueConstraint('plan_id', 'step_number', name='_plan_step_uc'),)

    def __repr__(self):
        return f"<AssemblyStep(id={self.id}, plan_id={self.plan_id}, step_number={self.step_number})>"